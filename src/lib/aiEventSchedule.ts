import type {
  DanceEvent,
  EventMilestone,
  EventWorkItem,
  Priority,
} from "../types";

export interface AiScheduleWorkDraft {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  priority: Priority;
}

export interface AiScheduleMilestoneDraft {
  key: string;
  title: string;
  dueDate: string;
  successCriteria: string;
  workItems: AiScheduleWorkDraft[];
}

export interface AiEventScheduleDraft {
  eventTitle: string;
  milestones: AiScheduleMilestoneDraft[];
  workItems: AiScheduleWorkDraft[];
}

export interface ScheduleImportPreview {
  milestones: EventMilestone[];
  workItems: EventWorkItem[];
  skippedMilestones: number;
  skippedWorkItems: number;
}

const priorities = new Set<Priority>(["high", "medium", "low"]);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label}は${max}文字以内で入力してください。`);
  return value.trim();
};
const date = (value: unknown, label: string) => {
  const parsed =
    typeof value === "string" ? new Date(`${value}T12:00:00`) : undefined;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !parsed ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label}の日付形式を確認してください。`);
  return value;
};
const optionalText = (value: unknown, label: string, max: number) => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > max)
    throw new Error(`${label}は${max}文字以内で入力してください。`);
  return value.trim();
};

function parseWork(value: unknown, eventDate: string): AiScheduleWorkDraft {
  if (!object(value)) throw new Error("作業の形式が正しくありません。");
  const startDate = date(value.startDate, "作業の開始日");
  const dueDate = date(value.dueDate, "作業の終了日");
  if (startDate > dueDate)
    throw new Error("作業の開始日は終了日以前にしてください。");
  if (dueDate > eventDate)
    throw new Error("作業の終了日はイベント開催日以前にしてください。");
  if (!priorities.has(value.priority as Priority))
    throw new Error(
      "作業の優先度は high・medium・low のいずれかにしてください。",
    );
  return {
    title: text(value.title, "作業名", 200),
    description: optionalText(value.description, "作業内容", 2000),
    startDate,
    dueDate,
    priority: value.priority as Priority,
  };
}

function jsonText(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseAiEventSchedule(
  input: string,
  event: Pick<DanceEvent, "title" | "date">,
): AiEventScheduleDraft {
  if (!input.trim()) throw new Error("AIの回答を貼り付けてください。");
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText(input));
  } catch {
    throw new Error(
      "JSONを読み取れませんでした。AIの回答全体を貼り付けてください。",
    );
  }
  if (!object(raw)) throw new Error("AIの回答の形式が正しくありません。");
  const eventTitle = text(raw.eventTitle, "イベント名", 200);
  if (eventTitle !== event.title)
    throw new Error(
      `イベント名が一致しません。「${event.title}」用の回答を貼り付けてください。`,
    );
  if (!Array.isArray(raw.milestones) || !Array.isArray(raw.workItems))
    throw new Error("milestones と workItems は配列で指定してください。");
  if (raw.milestones.length > 50)
    throw new Error("マイルストーンは50件以内にしてください。");
  const keys = new Set<string>();
  let workCount = raw.workItems.length;
  const milestones = raw.milestones.map((value) => {
    if (!object(value))
      throw new Error("マイルストーンの形式が正しくありません。");
    const key = text(value.key, "マイルストーンのkey", 80);
    if (keys.has(key))
      throw new Error(`マイルストーンのkey「${key}」が重複しています。`);
    keys.add(key);
    const dueDate = date(value.dueDate, "マイルストーンの期限");
    if (dueDate > event.date)
      throw new Error(
        "マイルストーンの期限はイベント開催日以前にしてください。",
      );
    if (!Array.isArray(value.workItems))
      throw new Error("マイルストーンの workItems は配列で指定してください。");
    workCount += value.workItems.length;
    return {
      key,
      title: text(value.title, "マイルストーン名", 200),
      dueDate,
      successCriteria: optionalText(value.successCriteria, "達成の目安", 2000),
      workItems: value.workItems.map((work) => parseWork(work, event.date)),
    };
  });
  if (workCount > 200) throw new Error("作業は合計200件以内にしてください。");
  return {
    eventTitle,
    milestones,
    workItems: raw.workItems.map((work) => parseWork(work, event.date)),
  };
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("ja");
const milestoneKey = (title: string, dueDate?: string) =>
  JSON.stringify([normalized(title), dueDate ?? ""]);
const workKey = (
  work: Pick<EventWorkItem, "title" | "startDate" | "dueDate">,
) =>
  JSON.stringify([
    normalized(work.title),
    work.startDate ?? "",
    work.dueDate ?? "",
  ]);

export function previewScheduleImport(
  event: DanceEvent,
  draft: AiEventScheduleDraft,
  now = new Date().toISOString(),
  createId: () => string = () => crypto.randomUUID(),
): ScheduleImportPreview {
  const existingMilestones = new Map(
    (event.milestones ?? []).map((item) => [
      milestoneKey(item.title, item.dueDate),
      item.id,
    ]),
  );
  const existingWork = new Set((event.workItems ?? []).map(workKey));
  const milestones: EventMilestone[] = [];
  const workItems: EventWorkItem[] = [];
  let skippedMilestones = 0;
  let skippedWorkItems = 0;
  let milestoneOrder =
    Math.max(
      -1,
      ...(event.milestones ?? []).map((item) => item.sortOrder ?? -1),
    ) + 1;
  let workOrder =
    Math.max(
      -1,
      ...(event.workItems ?? []).map((item) => item.sortOrder ?? -1),
    ) + 1;

  const addWork = (work: AiScheduleWorkDraft, milestoneId?: string) => {
    const candidate: EventWorkItem = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      sortOrder: workOrder,
      milestoneId,
      title: work.title,
      description: work.description,
      startDate: work.startDate,
      dueDate: work.dueDate,
      baseline: { startDate: work.startDate, dueDate: work.dueDate },
      priority: work.priority,
      status: "not_started",
      changes: [],
    };
    const key = workKey(candidate);
    if (existingWork.has(key)) {
      skippedWorkItems += 1;
      return;
    }
    existingWork.add(key);
    workOrder += 1;
    workItems.push(candidate);
  };

  for (const milestone of draft.milestones) {
    const key = milestoneKey(milestone.title, milestone.dueDate);
    let milestoneId = existingMilestones.get(key);
    if (milestoneId) skippedMilestones += 1;
    else {
      milestoneId = createId();
      milestones.push({
        id: milestoneId,
        createdAt: now,
        updatedAt: now,
        sortOrder: milestoneOrder++,
        title: milestone.title,
        successCriteria: milestone.successCriteria,
        dueDate: milestone.dueDate,
        baseline: { dueDate: milestone.dueDate },
        status: "not_started",
        changes: [],
      });
      existingMilestones.set(key, milestoneId);
    }
    for (const work of milestone.workItems) addWork(work, milestoneId);
  }
  for (const work of draft.workItems) addWork(work);
  return { milestones, workItems, skippedMilestones, skippedWorkItems };
}

export function aiEventSchedulePrompt(
  event: DanceEvent,
  additionalRequest = "",
) {
  const existingMilestones = new Map(
    (event.milestones ?? []).map((item) => [item.id, item.title]),
  );
  return [
    `「${event.title}」に向けた準備スケジュールを作成してください。`,
    "大会・イベントの内容から、到達点となるマイルストーンと具体的な準備作業を逆算してください。",
    "",
    "【条件】",
    `- 開催日: ${event.date}`,
    `- イベントの説明: ${event.description?.trim() || "未入力"}`,
    "- すべての日付は YYYY-MM-DD 形式にしてください。",
    "- 期限・終了日は開催日以前にしてください。",
    "- 作業には開始日と終了日を必ず設定し、開始日は終了日以前にしてください。",
    "- priority は high・medium・low のいずれかにしてください。",
    "- 既存予定と同じ内容は作らず、不足している予定だけを提案してください。",
    "- 回答は説明を付けず、下記形式の有効なJSONを ```json と ``` で囲んでください。",
    additionalRequest.trim() ? `- 追加の希望: ${additionalRequest.trim()}` : "",
    "",
    "【既存の準備スケジュール】",
    JSON.stringify(
      {
        milestones: (event.milestones ?? []).map((item) => ({
          title: item.title,
          dueDate: item.dueDate ?? null,
          status: item.status,
        })),
        workItems: (event.workItems ?? []).map((item) => ({
          milestone: item.milestoneId
            ? (existingMilestones.get(item.milestoneId) ?? null)
            : null,
          title: item.title,
          startDate: item.startDate ?? null,
          dueDate: item.dueDate ?? null,
          status: item.status,
        })),
      },
      null,
      2,
    ),
    "",
    "【回答JSONの形式】",
    JSON.stringify(
      {
        eventTitle: event.title,
        milestones: [
          {
            key: "unique-key",
            title: "到達点の名前",
            dueDate: "YYYY-MM-DD",
            successCriteria: "達成したと判断できる状態",
            workItems: [
              {
                title: "具体的な作業",
                description: "作業内容",
                startDate: "YYYY-MM-DD",
                dueDate: "YYYY-MM-DD",
                priority: "medium",
              },
            ],
          },
        ],
        workItems: [],
      },
      null,
      2,
    ),
  ].join("\n");
}
