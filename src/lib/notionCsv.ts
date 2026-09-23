import type { DanceEvent, EventWorkItem } from "../types";
import { sortedMilestones } from "./milestones";

const workStatusLabels: Record<EventWorkItem["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  completed: "完了",
};

const priorityLabels: Record<EventWorkItem["priority"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const notionCsvHeaders = [
  "名前",
  "イベント",
  "マイルストーン",
  "状態",
  "優先度",
  "開始日",
  "終了日",
  "イベント開催日",
  "完了日",
  "内容",
  "メモ",
  "Dance Note ID",
] as const;

export type NotionCsvRow = Record<(typeof notionCsvHeaders)[number], string>;

// Notion's CSV importer recognizes US-style dates as date properties.
const notionDate = (value?: string) => {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
};

export function notionScheduleRows(event: DanceEvent): NotionCsvRow[] {
  const milestones = sortedMilestones(event.milestones ?? []);
  const milestoneNames = new Map(
    milestones.map((milestone, index) => [
      milestone.id,
      `${String(index + 1).padStart(2, "0")}-${milestone.title}`,
    ]),
  );
  const common = {
    イベント: event.title,
    イベント開催日: notionDate(event.date),
    メモ: "",
  };

  return (event.workItems ?? []).map((work): NotionCsvRow => ({
    名前: work.title,
    ...common,
    マイルストーン: work.milestoneId
      ? (milestoneNames.get(work.milestoneId) ?? "未分類")
      : "未分類",
    状態: workStatusLabels[work.status],
    優先度: priorityLabels[work.priority],
    開始日: notionDate(work.startDate),
    終了日: notionDate(work.dueDate),
    完了日: notionDate(work.completedDate),
    内容: work.description,
    "Dance Note ID": `work:${work.id}`,
  }));
}

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function notionScheduleCsv(event: DanceEvent): string {
  const rows = notionScheduleRows(event);
  return [
    notionCsvHeaders.map(csvCell).join(","),
    ...rows.map((row) =>
      notionCsvHeaders.map((header) => csvCell(row[header])).join(","),
    ),
  ].join("\r\n");
}

const safeFilename = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "") || "イベント";

export function downloadNotionSchedule(event: DanceEvent) {
  const blob = new Blob(["\uFEFF", notionScheduleCsv(event)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(event.title)}-Notion.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
