import type { DanceDatabase } from "../data/db";
import { createBackup, readBackup, type PreparedBackup } from "../data/backup";
import {
  backupTables,
  object,
  type BackupRows,
} from "../data/backupValidation";
import { sha256 } from "./drive";
import { deviceState, seedJournal, silenceJournal } from "./journal";
import { applyEvents } from "./merge";
import {
  cleanRow,
  InvalidSyncData,
  makeEvent,
  parseSyncJson,
  recordKey,
  sharedRow,
  validateBatch,
  validateEvent,
  wireEvent,
  type ChangeEvent,
  type MediaReference,
  type Row,
  type SyncTable,
} from "./model";

const magic = new TextEncoder().encode("DANCE-NOTE-SYNC\n");
const headerSize = magic.length + 4 + 32;
const maxMetadata = 32 * 1024 * 1024;
export interface SnapshotManifest {
  format: "dance-note-snapshot";
  schemaVersion: 1;
  createdAt: string;
  accountId: string;
  events: ChangeEvent[];
  appliedEventIds: string[];
  media: MediaReference[];
  backupHash: string;
  verifiedFiles?: { id: string; sha256: string; modifiedTime?: string }[];
}
export interface PreparedSnapshot {
  manifest: SnapshotManifest;
  backup: PreparedBackup;
}
export async function captureSnapshot(database: DanceDatabase) {
  await seedJournal(database);
  return database.transaction("r", database.tables, async () => {
    const tables = Object.fromEntries(
      await Promise.all(
        backupTables.map(async (table) => [
          table,
          await database.table(table).toArray(),
        ]),
      ),
    ) as BackupRows;
    const attachmentIds = new Set(tables.attachments.map((row) => row.id));
    return {
      tables,
      files: (await database.attachmentFiles.toArray()).filter((file) =>
        attachmentIds.has(file.id),
      ),
      media: await database.syncMedia.toArray(),
      events: await database.syncEvents.toArray(),
      state: await database.syncMeta.get("device"),
      verifiedFiles: await database.syncFiles.toArray(),
      createdAt: new Date().toISOString(),
    };
  });
}
export async function encodeSnapshot(
  database: DanceDatabase,
  capture: Awaited<ReturnType<typeof captureSnapshot>>,
  media: MediaReference[],
) {
  const backup = await createBackup(undefined, database, {
    tables: capture.tables,
    files: capture.files,
  });
  const manifest: SnapshotManifest = {
    format: "dance-note-snapshot",
    schemaVersion: 1,
    createdAt: capture.createdAt,
    accountId: capture.state?.account?.id ?? "",
    events: capture.events.map(wireEvent),
    appliedEventIds: capture.events
      .filter((event) => event.applied)
      .map((event) => event.eventId),
    media,
    backupHash: await sha256(backup),
    verifiedFiles: capture.verifiedFiles,
  };
  const metadata = new Blob([JSON.stringify(manifest)], {
    type: "application/json",
  });
  if (metadata.size > maxMetadata)
    throw new Error(
      "履歴が多すぎるためスナップショットを作成できません。変更履歴はそのまま保持しています。",
    );
  const header = new Uint8Array(headerSize);
  header.set(magic);
  new DataView(header.buffer).setUint32(magic.length, metadata.size);
  header.set(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await metadata.arrayBuffer()),
    ),
    magic.length + 4,
  );
  return new Blob([header, metadata, backup], {
    type: "application/octet-stream",
  });
}
export async function readSnapshot(
  blob: Blob,
  accountId: string,
): Promise<PreparedSnapshot> {
  const header = new Uint8Array(await blob.slice(0, headerSize).arrayBuffer());
  if (
    header.length !== headerSize ||
    magic.some((byte, index) => header[index] !== byte)
  )
    throw new InvalidSyncData("スナップショットの形式が不正です。");
  const size = new DataView(header.buffer).getUint32(magic.length);
  if (!size || size > maxMetadata || headerSize + size >= blob.size)
    throw new InvalidSyncData("スナップショットが破損しています。");
  const metadata = blob.slice(headerSize, headerSize + size);
  const expected = Array.from(header.slice(magic.length + 4), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if ((await sha256(metadata)) !== expected)
    throw new InvalidSyncData("スナップショットの情報が破損しています。");
  const value = parseSyncJson(await metadata.text());
  if (
    !object(value) ||
    value.format !== "dance-note-snapshot" ||
    value.schemaVersion !== 1 ||
    value.accountId !== accountId ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.appliedEventIds) ||
    !value.appliedEventIds.every((id) => typeof id === "string") ||
    typeof value.backupHash !== "string"
  )
    throw new InvalidSyncData(
      "スナップショットのアカウント・バージョン・内容を確認できませんでした。",
    );
  value.events.forEach(validateEvent);
  if (
    value.verifiedFiles !== undefined &&
    (!Array.isArray(value.verifiedFiles) ||
      value.verifiedFiles.some(
        (file) =>
          !object(file) ||
          typeof file.id !== "string" ||
          !file.id ||
          typeof file.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(file.sha256) ||
          (file.modifiedTime !== undefined &&
            (typeof file.modifiedTime !== "string" ||
              Number.isNaN(Date.parse(file.modifiedTime)))),
      ))
  )
    throw new InvalidSyncData(
      "スナップショットの受信済みファイル情報が不正です。",
    );
  validateBatch({
    format: "dance-note-events",
    schemaVersion: 1,
    batchId: "snapshot",
    events: [],
    media: value.media,
  });
  const ids = new Set(value.events.map((event) => event.eventId));
  if (
    ids.size !== value.events.length ||
    value.appliedEventIds.some((id) => !ids.has(id))
  )
    throw new InvalidSyncData("スナップショットの反映済み履歴が不正です。");
  const backupBlob = blob.slice(headerSize + size);
  if ((await sha256(backupBlob)) !== value.backupHash)
    throw new InvalidSyncData("スナップショットのデータが破損しています。");
  const manifest = value as unknown as SnapshotManifest;
  let backup: PreparedBackup;
  try {
    backup = await readBackup(backupBlob);
  } catch (error) {
    throw new InvalidSyncData(
      error instanceof Error ? error.message : "バックアップが破損しています。",
    );
  }
  for (const file of backup.files) {
    const ref = manifest.media.find((item) => item.id === file.id);
    if (
      !ref ||
      (await sha256(file.blob)) !== ref.blob.sha256 ||
      file.blob.type !== ref.blob.type ||
      !!file.thumbnailBlob !== !!ref.thumbnailBlob ||
      (file.thumbnailBlob &&
        ref.thumbnailBlob &&
        (await sha256(file.thumbnailBlob)) !== ref.thumbnailBlob.sha256)
    )
      throw new InvalidSyncData(
        "スナップショットと添付原本の情報が一致しません。",
      );
  }
  return { manifest, backup };
}

// Restore as new causal events rather than erasing the local database or its
// pending history. Records absent from the backup remain on the device.
export async function restoreSnapshot(
  database: DanceDatabase,
  snapshot: PreparedSnapshot,
) {
  await database.transaction("rw", database.tables, async () => {
    silenceJournal();
    await applyEvents(
      database,
      snapshot.manifest.events,
      snapshot.backup.files,
    );
    const device = await deviceState(database);
    for (const table of backupTables)
      for (const raw of snapshot.backup.tables[table]) {
        const row = cleanRow(raw)!;
        if (!sharedRow(table, row.id)) continue;
        const key = recordKey(table, row.id),
          revision = await database.syncRevisions.get(key);
        const before = cleanRow(await database.table(table).get(row.id));
        const after: Row = {
          ...row,
          ...("updatedAt" in row
            ? {
                updatedAt: new Date(
                  Math.max(
                    Date.now(),
                    Date.parse(String(before?.updatedAt ?? row.updatedAt)) + 1,
                  ),
                ).toISOString(),
              }
            : {}),
        };
        const event = makeEvent(
          table,
          row.id,
          before,
          after,
          device.deviceId,
          revision?.heads ?? [],
          "resolve",
          revision?.fields,
          device.deviceName,
        );
        await database.table(table).put(after);
        await database.syncEvents.add({
          ...event,
          status: "pending",
          applied: true,
        });
        await database.syncRevisions.put({
          key,
          heads: [event.eventId],
          fields: [
            ...new Set([
              ...(revision?.fields ?? []),
              ...Object.keys(event.changes),
            ]),
          ],
          conflicted: false,
          remoteVersion: revision?.remoteVersion,
        });
        await database.syncConflicts.delete(key);
      }
    for (const file of snapshot.backup.files) {
      await database.syncMedia.put(file);
      if (await database.attachments.get(file.id))
        await database.attachmentFiles.put(file);
    }
  });
}
export async function restoreLocalSafetyCopy(
  database: DanceDatabase,
  blob: Blob,
) {
  const state = await deviceState(database);
  const prepared = await readSnapshot(blob, state.account?.id ?? "");
  const capture = await captureSnapshot(database);
  const part = async (file: Blob) => {
    const hash = await sha256(file);
    return {
      name: `dance-note-media-${hash}`,
      sha256: hash,
      size: file.size,
      type: file.type,
    };
  };
  const refs: MediaReference[] = [];
  for (const file of capture.media)
    refs.push({
      id: file.id,
      blob: await part(file.blob),
      ...(file.thumbnailBlob
        ? { thumbnailBlob: await part(file.thumbnailBlob) }
        : {}),
    });
  const safety = await encodeSnapshot(database, capture, refs);
  await database.syncSnapshots.add({
    id: crypto.randomUUID(),
    createdAt: capture.createdAt,
    blob: safety,
  });
  await restoreSnapshot(database, prepared);
}
export async function hasSharedData(database: DanceDatabase) {
  for (const table of backupTables)
    if (
      (await database.table(table).toArray()).some((row) =>
        sharedRow(table as SyncTable, row.id),
      )
    )
      return true;
  return false;
}
