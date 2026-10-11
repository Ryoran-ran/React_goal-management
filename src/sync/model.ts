import {
  backupTables,
  object,
  validateBackupRows,
  type BackupTable,
} from "../data/backupValidation";

export const syncTables = backupTables;
export type SyncTable = BackupTable;
export type Row = Record<string, unknown> & { id: string };
export interface FieldValue {
  present: boolean;
  value?: unknown;
}
export interface ChangeEvent {
  eventId: string;
  deviceId: string;
  deviceName: string;
  recordType: SyncTable;
  recordId: string;
  operation: "create" | "update" | "delete" | "resolve";
  baseRevision: string[];
  changes: Record<string, FieldValue>;
  before: Row | null;
  after: Row | null;
  createdAt: string;
  schemaVersion: 1;
}
export interface StoredEvent extends ChangeEvent {
  status: "pending" | "uploaded";
  applied: boolean;
}
export interface Revision {
  key: string;
  heads: string[];
  fields: string[];
  conflicted: boolean;
  remoteVersion?: string;
}
export interface SyncConflict {
  key: string;
  recordType: SyncTable;
  recordId: string;
  fields: string[];
  eventIds: string[];
  current: Row | null;
  merged: Row | null;
  candidates: {
    eventId: string;
    deviceId: string;
    deviceName: string;
    createdAt: string;
    row: Row | null;
  }[];
  reason: "fields" | "unique" | "relation";
}
export interface DeviceState {
  key: "device";
  deviceId: string;
  deviceName: string;
  account?: { id: string; email: string };
  autoSync: boolean;
  idleSeconds: number;
  intervalMinutes: number;
  lastSync?: string;
  lastSnapshot?: string;
  error?: string;
  initializedCloud?: boolean;
  linked?: boolean;
  blocked?: boolean;
}
export interface MediaRecord {
  id: string;
  blob: Blob;
  thumbnailBlob?: Blob;
}
export interface MediaPart {
  name: string;
  sha256: string;
  size: number;
  type: string;
}
export interface MediaReference {
  id: string;
  blob: MediaPart;
  thumbnailBlob?: MediaPart;
}
export interface EventBatch {
  format: "dance-note-events";
  schemaVersion: 1;
  batchId: string;
  events: ChangeEvent[];
  media: MediaReference[];
}
export interface Outbox {
  id: string;
  batch: EventBatch;
  uploaded: boolean;
}
export class InvalidSyncData extends Error {}
export function parseSyncJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidSyncData(
      "同期データを読み取れません。自動適用を停止しました。",
    );
  }
}
export const recordKey = (table: SyncTable, id: string) =>
  JSON.stringify([table, id]);
export const sharedSetting = (id: string) =>
  id.startsWith("ongoing-lesson-series:") ||
  ["lesson-custom-categories", "event-practice-templates"].includes(id);
export const sharedRow = (table: SyncTable, id: string) =>
  table !== "settings" || sharedSetting(id);
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
export const cleanRow = (row: unknown): Row | null =>
  row == null ? null : JSON.parse(JSON.stringify(row));
export const content = (row: Row | null) =>
  canonical(
    row &&
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !["createdAt", "updatedAt"].includes(key),
        ),
      ),
  );
const field = (row: Row | null, key: string): FieldValue =>
  row && Object.hasOwn(row, key)
    ? { present: true, value: row[key] }
    : { present: false };
const userFields = (row: Row | null) =>
  Object.keys(row ?? {}).filter(
    (key) => !["id", "createdAt", "updatedAt"].includes(key),
  );
export function makeEvent(
  table: SyncTable,
  id: string,
  before: Row | null,
  after: Row | null,
  deviceId: string,
  parents: string[],
  operation?: ChangeEvent["operation"],
  knownFields: string[] = [],
  deviceName = deviceId.slice(0, 12),
): ChangeEvent {
  const op = operation ?? (after ? (before ? "update" : "create") : "delete");
  const full = op === "create" || op === "resolve";
  const keys = new Set([
    ...userFields(before),
    ...userFields(after),
    ...(full ? knownFields : []),
  ]);
  const changes = Object.fromEntries(
    [...keys]
      .filter(
        (key) =>
          full ||
          canonical(field(before, key)) !== canonical(field(after, key)),
      )
      .map((key) => [key, field(after, key)]),
  );
  return {
    eventId: crypto.randomUUID(),
    deviceId,
    deviceName,
    recordType: table,
    recordId: id,
    operation: op,
    baseRevision: [...parents].sort(),
    changes,
    before,
    after,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}
export function wireEvent(event: StoredEvent | ChangeEvent): ChangeEvent {
  const {
    eventId,
    deviceId,
    deviceName,
    recordType,
    recordId,
    operation,
    baseRevision,
    changes,
    before,
    after,
    createdAt,
    schemaVersion,
  } = event;
  return {
    eventId,
    deviceId,
    deviceName,
    recordType,
    recordId,
    operation,
    baseRevision,
    changes,
    before,
    after,
    createdAt,
    schemaVersion,
  };
}
export function validateRow(
  table: SyncTable,
  row: unknown,
): asserts row is Row {
  const rows = Object.fromEntries(
    backupTables.map((name) => [name, name === table ? [row] : []]),
  );
  try {
    validateBackupRows(rows);
  } catch (error) {
    throw new InvalidSyncData(
      error instanceof Error ? error.message : "同期データが不正です。",
    );
  }
  if (table === "settings" && (!object(row) || !sharedSetting(String(row.id))))
    throw new InvalidSyncData("同期対象外の設定が含まれています。");
}
const safeKey = (key: string) =>
  ![
    "__proto__",
    "prototype",
    "constructor",
    "id",
    "createdAt",
    "updatedAt",
  ].includes(key);
export function validateEvent(value: unknown): asserts value is ChangeEvent {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !syncTables.includes(value.recordType as SyncTable) ||
    typeof value.deviceName !== "string" ||
    !value.deviceName ||
    value.deviceName.length > 80 ||
    !["create", "update", "delete", "resolve"].includes(
      String(value.operation),
    ) ||
    ![value.eventId, value.deviceId, value.recordId].every(
      (id) => typeof id === "string" && id.length > 0 && id.length < 500,
    ) ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !Array.isArray(value.baseRevision) ||
    !value.baseRevision.every(
      (id) => typeof id === "string" && id && id !== value.eventId,
    ) ||
    new Set(value.baseRevision).size !== value.baseRevision.length ||
    !object(value.changes)
  )
    throw new InvalidSyncData(
      "同期履歴の形式が不正です。自動適用を停止しました。",
    );
  const event = value as unknown as ChangeEvent;
  for (const row of [event.before, event.after]) {
    if (row !== null) {
      validateRow(event.recordType, row);
      if (row.id !== event.recordId)
        throw new InvalidSyncData("履歴のIDが一致しません。");
    }
  }
  if (
    !sharedRow(event.recordType, event.recordId) ||
    (event.operation === "delete" && event.after !== null) ||
    (["create", "update"].includes(event.operation) && event.after === null) ||
    (event.operation === "create" && event.before !== null) ||
    (["update", "delete"].includes(event.operation) &&
      (!event.before || !event.baseRevision.length))
  )
    throw new InvalidSyncData("履歴の操作が不正です。");
  for (const [key, change] of Object.entries(event.changes)) {
    if (
      !safeKey(key) ||
      !object(change) ||
      typeof change.present !== "boolean" ||
      canonical(change) !== canonical(field(event.after, key))
    )
      throw new InvalidSyncData("履歴の差分が不正です。");
  }
  const expected = makeEvent(
    event.recordType,
    event.recordId,
    event.before,
    event.after,
    event.deviceId,
    event.baseRevision,
    event.operation,
    Object.keys(event.changes),
  ).changes;
  if (canonical(expected) !== canonical(event.changes))
    throw new InvalidSyncData("履歴の変更前後と差分が一致しません。");
}
export function conflictSelection(
  conflict: SyncConflict,
  selected: Row | null,
): Row | null {
  if (
    !selected ||
    conflict.fields.some((key) => key.startsWith("$")) ||
    !conflict.merged
  )
    return cleanRow(selected);
  const row = cleanRow(conflict.merged)!;
  for (const key of conflict.fields) {
    if (Object.hasOwn(selected, key)) row[key] = selected[key];
    else delete row[key];
  }
  return row;
}
export function validateBatch(value: unknown): asserts value is EventBatch {
  if (
    !object(value) ||
    value.format !== "dance-note-events" ||
    value.schemaVersion !== 1 ||
    typeof value.batchId !== "string" ||
    !Array.isArray(value.events) ||
    value.events.length > 500 ||
    !Array.isArray(value.media)
  )
    throw new InvalidSyncData("同期ファイルの形式が不正です。");
  value.events.forEach(validateEvent);
  for (const ref of value.media) {
    if (!object(ref) || typeof ref.id !== "string" || !ref.id)
      throw new InvalidSyncData("添付資料の同期情報が不正です。");
    for (const part of [
      ref.blob,
      ...(ref.thumbnailBlob ? [ref.thumbnailBlob] : []),
    ])
      if (
        !object(part) ||
        typeof part.name !== "string" ||
        !/^dance-note-media-[a-f0-9]{64}$/.test(part.name) ||
        typeof part.sha256 !== "string" ||
        part.name !== `dance-note-media-${part.sha256}` ||
        !Number.isSafeInteger(part.size) ||
        (part.size as number) < 0 ||
        typeof part.type !== "string"
      )
        throw new InvalidSyncData("添付資料の同期情報が不正です。");
  }
}
// Causal ancestry, never clocks, determines which edits supersede others.
// Arrays are conservative atomic fields; independent top-level fields merge.
export function materialize(events: ChangeEvent[]): {
  row: Row | null;
  revision: Omit<Revision, "key">;
  fields: string[];
} {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const children = new Map<string, ChangeEvent[]>();
  const remaining = new Map<string, number>();
  const ordered = events.filter((event) => !event.baseRevision.length);
  for (const event of events) {
    remaining.set(event.eventId, event.baseRevision.length);
    for (const parent of event.baseRevision) {
      if (!byId.has(parent))
        throw new InvalidSyncData(
          "履歴の参照が不足しています。自動適用を停止しました。",
        );
      const entries = children.get(parent) ?? [];
      entries.push(event);
      children.set(parent, entries);
    }
  }
  for (let index = 0; index < ordered.length; index++)
    for (const child of children.get(ordered[index].eventId) ?? []) {
      const count = remaining.get(child.eventId)! - 1;
      remaining.set(child.eventId, count);
      if (!count) ordered.push(child);
    }
  if (ordered.length !== events.length)
    throw new InvalidSyncData(
      "履歴の参照が循環しています。自動適用を停止しました。",
    );
  const reachability = new Map<string, boolean>();
  function ancestor(a: string, b: string): boolean {
    const key = `${a}:${b}`;
    const known = reachability.get(key);
    if (known !== undefined) return known;
    const queue = [...byId.get(b)!.baseRevision],
      seen = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!;
      if (id === a) {
        reachability.set(key, true);
        return true;
      }
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(...byId.get(id)!.baseRevision);
      }
    }
    reachability.set(key, false);
    return false;
  }
  const maximal = (items: ChangeEvent[]) =>
    items.filter((a) => !items.some((b) => ancestor(a.eventId, b.eventId)));
  const registers = new Map<string, ChangeEvent[]>();
  const headSet = new Set<string>();
  const baseCandidates = (parents: string[], key: string) => {
    const found: ChangeEvent[] = [],
      queue = [...parents],
      seen = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const event = byId.get(id)!;
      if (Object.hasOwn(event.changes, key)) found.push(event);
      else queue.push(...event.baseRevision);
    }
    return maximal(found);
  };
  for (const event of ordered) {
    if (
      event.operation !== "resolve" &&
      event.baseRevision.some(
        (id) => (byId.get(id)!.after !== null) !== (event.before !== null),
      )
    )
      throw new InvalidSyncData(
        "履歴の追加・削除と変更前リビジョンが一致しません。",
      );
    for (const parent of event.baseRevision) headSet.delete(parent);
    headSet.add(event.eventId);
    for (const key of Object.keys(event.changes)) {
      const previous = registers.get(key) ?? [];
      // Check the claimed base value against the causally observed changes.
      if (["update", "delete"].includes(event.operation)) {
        const bases = baseCandidates(event.baseRevision, key);
        const expected = new Set(
          bases.map((candidate) => canonical(candidate.changes[key])),
        );
        if (!expected.size) expected.add(canonical({ present: false }));
        if (
          expected.size !== 1 ||
          !expected.has(canonical(field(event.before, key)))
        )
          throw new InvalidSyncData(
            "履歴の変更前リビジョンと値が一致しません。自動適用を停止しました。",
          );
      }
      registers.set(key, [
        ...previous.filter(
          (candidate) => !ancestor(candidate.eventId, event.eventId),
        ),
        event,
      ]);
    }
  }
  const heads = [...headSet].sort();
  const conflicts: string[] = [];
  const exists = heads.map((id) => byId.get(id)!.after !== null);
  if (new Set(exists).size > 1) conflicts.push("$record");
  const row: Row = { id: events[0]?.recordId ?? "" };
  const keys = [...registers.keys()].sort();
  for (const key of keys) {
    const candidates = registers.get(key)!;
    const values = new Map(
      candidates.map((event) => [
        canonical(event.changes[key]),
        event.changes[key],
      ]),
    );
    if (values.size > 1) conflicts.push(key);
    const chosen = [...values.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )[0]?.[1];
    if (chosen?.present) row[key] = chosen.value;
  }
  const rows = events.flatMap((event) => (event.after ? [event.after] : []));
  for (const key of ["createdAt", "updatedAt"]) {
    const values = rows
      .map((entry) => entry[key])
      .filter((value): value is string => typeof value === "string")
      .sort();
    if (values.length)
      row[key] = key === "createdAt" ? values[0] : values.at(-1);
  }
  return {
    row: exists.includes(true) ? row : null,
    revision: { heads, fields: keys, conflicted: conflicts.length > 0 },
    fields: conflicts,
  };
}
