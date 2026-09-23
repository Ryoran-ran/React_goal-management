import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";

export interface CalendarPromptItem {
  id: string;
  kind: "event" | "milestone" | "work";
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

const eventTypeLabels: Record<DanceEvent["type"], string> = {
  competition: "競技会",
  medal_test: "メダルテスト",
  performance: "発表会",
  demo: "デモ",
  other: "その他",
};
const milestoneStatusLabels: Record<EventMilestone["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  achieved: "達成",
  skipped: "見送り",
};
const workStatusLabels: Record<EventWorkItem["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  completed: "完了",
};

export function googleCalendarItems(
  event: DanceEvent,
  includeFinished = false,
): { items: CalendarPromptItem[]; omittedUndatedCount: number } {
  const milestones = event.milestones ?? [];
  const milestoneNames = new Map(
    milestones.map((milestone) => [milestone.id, milestone.title]),
  );
  const items: CalendarPromptItem[] = [
    {
      id: `event:${event.id}`,
      kind: "event",
      title: `[${event.title}] 開催日`,
      startDate: event.date,
      endDate: event.date,
      description: [
        `Dance Note ID: event:${event.id}`,
        `種類: ${eventTypeLabels[event.type]}`,
        event.description?.trim() ? `メモ: ${event.description.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  let omittedUndatedCount = 0;

  for (const milestone of milestones) {
    if (
      !includeFinished &&
      (milestone.status === "achieved" || milestone.status === "skipped")
    )
      continue;
    if (!milestone.dueDate) {
      omittedUndatedCount += 1;
      continue;
    }
    items.push({
      id: `milestone:${milestone.id}`,
      kind: "milestone",
      title: `[${event.title}] ${milestone.title}`,
      startDate: milestone.dueDate,
      endDate: milestone.dueDate,
      description: [
        `Dance Note ID: milestone:${milestone.id}`,
        `大会・イベント: ${event.title}`,
        `状態: ${milestoneStatusLabels[milestone.status]}`,
        milestone.startDate ? `準備開始予定: ${milestone.startDate}` : "",
        milestone.successCriteria.trim()
          ? `達成の目安: ${milestone.successCriteria.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  for (const work of event.workItems ?? []) {
    if (!includeFinished && work.status === "completed") continue;
    const startDate = work.startDate ?? work.dueDate;
    const endDate = work.dueDate ?? work.startDate;
    if (!startDate || !endDate) {
      omittedUndatedCount += 1;
      continue;
    }
    items.push({
      id: `work:${work.id}`,
      kind: "work",
      title: `[${event.title}] ${work.title}`,
      startDate,
      endDate,
      description: [
        `Dance Note ID: work:${work.id}`,
        `大会・イベント: ${event.title}`,
        work.milestoneId
          ? `関連する到達点: ${milestoneNames.get(work.milestoneId) ?? "未分類"}`
          : "関連する到達点: 未分類",
        `状態: ${workStatusLabels[work.status]}`,
        work.description.trim() ? `内容: ${work.description.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  return {
    items: items.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.kind.localeCompare(b.kind) ||
        a.title.localeCompare(b.title, "ja"),
    ),
    omittedUndatedCount,
  };
}

export function googleCalendarPrompt(
  event: DanceEvent | undefined,
  includeFinished = false,
  additionalRequest = "",
  calendarName = "Dance Note",
): string {
  if (!event) return "";
  const schedule = googleCalendarItems(event, includeFinished);
  const targetCalendarName = calendarName.trim() || "Dance Note";
  const rules = [
    "- タイムゾーンは Asia/Tokyo です。",
    `- すべての予定の登録先は「${targetCalendarName}」という名前のカレンダーです。`,
    "- 同じ名前のカレンダーが複数ある場合は、候補を示してどれに登録するか確認してください。",
    "- 指定したカレンダーが存在しない場合は、そのことを示して作成してよいか確認してください。私が確認するまでカレンダーを作成しないでください。",
    "- 日時の指定がないため、すべて終日予定として扱ってください。",
    "- startDate と endDate は両端を含む予定期間です。",
    "- 登録前に、作成予定の一覧と既存カレンダー内の重複候補を示し、私の確認を求めてください。",
    "- 同じ Dance Note ID、または同じタイトル・開始日・終了日の予定がすでにある場合は、新規作成せず重複候補として扱ってください。",
    "- 私が確認するまで、既存予定の変更・削除や新規予定の作成は行わないでください。",
    "- 確認後に登録する際は、description を予定の説明欄へそのまま入れてください。",
    schedule.omittedUndatedCount
      ? `- 日付未設定の項目が${schedule.omittedUndatedCount}件あります。これらは登録対象データに含まれていません。`
      : "- 日付未設定で除外された項目はありません。",
    additionalRequest.trim() ? `- 追加の希望: ${additionalRequest.trim()}` : "",
  ].filter(Boolean);
  return [
    "Googleカレンダーに、次の大会・イベントの予定を登録してください。",
    "",
    "【登録ルール】",
    ...rules,
    "",
    "【登録対象：JSON】",
    JSON.stringify(
      {
        source: "Dance Note",
        targetCalendarName,
        eventTitle: event.title,
        items: schedule.items,
      },
      null,
      2,
    ),
  ].join("\n");
}
