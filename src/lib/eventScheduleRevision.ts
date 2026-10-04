import type { DanceEvent, MilestonePlan } from "../types";

export type ScheduleRevisionKind = "milestone" | "work";

export interface ScheduleRevisionChangeDraft extends MilestonePlan {
  kind: ScheduleRevisionKind;
  id: string;
  reason: string;
}

export interface EventScheduleRevisionDraft {
  eventTitle: string;
  changes: ScheduleRevisionChangeDraft[];
}

export interface ScheduleRevisionPreviewItem {
  kind: ScheduleRevisionKind;
  id: string;
  title: string;
  from: MilestonePlan;
  to: MilestonePlan;
  reason: string;
}

export interface ScheduleRevisionPreview {
  changes: ScheduleRevisionPreviewItem[];
  skippedUnchanged: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label}は${max}文字以内で入力してください。`);
  return value.trim();
};

const optionalDate = (value: unknown, label: string) => {
  if (value === null) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${label}はYYYY-MM-DD形式かnullで指定してください。`);
  const parsed = new Date(`${value}T12:00:00`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label}の日付を確認してください。`);
  return value;
};

function jsonText(input: string) {
  const fenced = [...input.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  const jsonFence = fenced.find((match) => match[1].trim().startsWith("{"));
  return jsonFence?.[1] ?? input.trim();
}

export function parseEventScheduleRevision(
  input: string,
  event: DanceEvent,
): EventScheduleRevisionDraft {
  if (!input.trim()) throw new Error("AIの回答を貼り付けてください。");
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText(input));
  } catch {
    throw new Error(
      "変更案のJSONを読み取れませんでした。AIが示した最終回答を貼り付けてください。",
    );
  }
  if (!object(raw)) throw new Error("AIの回答の形式が正しくありません。");
  const eventTitle = text(raw.eventTitle, "イベント名", 200);
  if (eventTitle !== event.title)
    throw new Error(
      `イベント名が一致しません。「${event.title}」用の回答を貼り付けてください。`,
    );
  if (!Array.isArray(raw.changes))
    throw new Error("changesは配列で指定してください。");
  if (raw.changes.length > 250)
    throw new Error("一度に変更できる予定は250件までです。");

  const milestones = new Map(
    (event.milestones ?? []).map((item) => [item.id, item]),
  );
  const workItems = new Map(
    (event.workItems ?? []).map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
  const changes = raw.changes.map((value) => {
    if (!object(value)) throw new Error("変更予定の形式が正しくありません。");
    if (value.kind !== "milestone" && value.kind !== "work")
      throw new Error("kindはmilestoneまたはworkで指定してください。");
    const kind: ScheduleRevisionKind = value.kind;
    const id = text(value.id, "予定ID", 300);
    const key = `${kind}:${id}`;
    if (seen.has(key)) throw new Error(`予定ID「${id}」が重複しています。`);
    seen.add(key);
    const item = kind === "milestone" ? milestones.get(id) : workItems.get(id);
    if (!item) throw new Error(`変更対象の予定「${id}」が見つかりません。`);
    if (
      (kind === "milestone" &&
        (item.status === "achieved" || item.status === "skipped")) ||
      (kind === "work" && item.status === "completed")
    )
      throw new Error(`完了・見送り済みの「${item.title}」は変更できません。`);
    if (!("startDate" in value) || !("dueDate" in value))
      throw new Error("各変更にはstartDateとdueDateを指定してください。");
    const startDate = optionalDate(value.startDate, `${item.title}の開始日`);
    const dueDate = optionalDate(value.dueDate, `${item.title}の終了日`);
    if (startDate && dueDate && startDate > dueDate)
      throw new Error(`「${item.title}」の開始日は終了日以前にしてください。`);
    if (
      (startDate && startDate > event.date) ||
      (dueDate && dueDate > event.date)
    )
      throw new Error(
        `「${item.title}」の日付はイベント開催日以前にしてください。`,
      );
    return {
      kind,
      id,
      startDate,
      dueDate,
      reason: text(value.reason, `${item.title}の変更理由`, 500),
    };
  });
  return { eventTitle, changes };
}

export function previewEventScheduleRevision(
  event: DanceEvent,
  draft: EventScheduleRevisionDraft,
): ScheduleRevisionPreview {
  const milestones = new Map(
    (event.milestones ?? []).map((item) => [item.id, item]),
  );
  const workItems = new Map(
    (event.workItems ?? []).map((item) => [item.id, item]),
  );
  let skippedUnchanged = 0;
  const changes = draft.changes.flatMap((change) => {
    const item =
      change.kind === "milestone"
        ? milestones.get(change.id)
        : workItems.get(change.id);
    if (!item) return [];
    const from = {
      ...(item.startDate ? { startDate: item.startDate } : {}),
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    };
    const to = {
      ...(change.startDate ? { startDate: change.startDate } : {}),
      ...(change.dueDate ? { dueDate: change.dueDate } : {}),
    };
    if (from.startDate === to.startDate && from.dueDate === to.dueDate) {
      skippedUnchanged += 1;
      return [];
    }
    return [{ ...change, title: item.title, from, to }];
  });
  return { changes, skippedUnchanged };
}
