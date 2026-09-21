import type { DanceEvent, EventMilestone, MilestonePlan } from "../types";
import { addDays, daysUntil, localDate, monthRange, weekOf } from "./dates";

export const milestoneStatuses = {
  not_started: "未着手",
  in_progress: "取り組み中",
  achieved: "達成",
  skipped: "見送り",
};
export const unfinished = (item: EventMilestone) =>
  item.status !== "achieved" && item.status !== "skipped";
export const sortedMilestones = (items: EventMilestone[]) =>
  [...items].sort(
    (a, b) =>
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
export const nextMilestone = (event: DanceEvent) =>
  sortedMilestones(event.milestones ?? []).find(unfinished);
export const milestonePlanDelay = (item: EventMilestone) =>
  item.baseline?.dueDate && item.dueDate
    ? daysUntil(item.dueDate, item.baseline.dueDate)
    : 0;
export function milestoneTiming(item: EventMilestone, today = localDate()) {
  if (item.status === "skipped") return "見送り";
  if (!item.dueDate) return "期限未設定";
  if (item.status === "achieved") {
    const late = item.completedDate
      ? daysUntil(item.completedDate, item.dueDate)
      : 0;
    return late > 0 ? `${late}日遅れて達成` : "期限内に達成";
  }
  const days = daysUntil(item.dueDate, today);
  return days < 0
    ? `期限超過 ${-days}日`
    : days === 0
      ? "今日が期限"
      : `あと${days}日`;
}
export const milestonePlan = (item: MilestonePlan): MilestonePlan => ({
  ...(item.startDate ? { startDate: item.startDate } : {}),
  ...(item.dueDate ? { dueDate: item.dueDate } : {}),
});
export function updateMilestonePlan(
  item: EventMilestone,
  next: MilestonePlan,
  reason: string,
  now = new Date().toISOString(),
): EventMilestone {
  const from = milestonePlan(item),
    to = milestonePlan(next);
  const changed =
    from.startDate !== to.startDate || from.dueDate !== to.dueDate;
  return {
    ...item,
    startDate: to.startDate,
    dueDate: to.dueDate,
    baseline:
      item.baseline ??
      (from.startDate || from.dueDate
        ? from
        : to.startDate || to.dueDate
          ? to
          : undefined),
    changes: changed
      ? [...item.changes, { changedAt: now, from, to, reason: reason.trim() }]
      : item.changes,
    updatedAt: now,
  };
}
export function shiftMilestones(
  items: EventMilestone[],
  days: number,
): EventMilestone[] {
  return items.map((item) =>
    unfinished(item)
      ? updateMilestonePlan(
          item,
          {
            startDate: item.startDate
              ? addDays(item.startDate, days)
              : undefined,
            dueDate: item.dueDate ? addDays(item.dueDate, days) : undefined,
          },
          "イベント開催日の変更",
        )
      : item,
  );
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "0001-01-01" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function validPlan(value: unknown): value is MilestonePlan {
  return (
    object(value) &&
    (value.startDate === undefined || validDate(value.startDate)) &&
    (value.dueDate === undefined || validDate(value.dueDate)) &&
    (!value.startDate ||
      !value.dueDate ||
      String(value.startDate) <= String(value.dueDate))
  );
}
export function validateMilestones(
  value: unknown,
): asserts value is EventMilestone[] {
  if (!Array.isArray(value))
    throw new Error("マイルストーンの形式が正しくありません。");
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      typeof item.successCriteria !== "string" ||
      !Object.hasOwn(milestoneStatuses, String(item.status)) ||
      !timestamp(item.createdAt) ||
      !timestamp(item.updatedAt) ||
      !validPlan(item) ||
      (item.baseline !== undefined && !validPlan(item.baseline)) ||
      (item.actualStartDate !== undefined &&
        !validDate(item.actualStartDate)) ||
      (item.completedDate !== undefined && !validDate(item.completedDate)) ||
      (item.status === "achieved" && !item.completedDate) ||
      (item.status !== "achieved" && item.completedDate !== undefined) ||
      (item.actualStartDate &&
        item.completedDate &&
        String(item.actualStartDate) > String(item.completedDate)) ||
      !Array.isArray(item.changes) ||
      !item.changes.every(
        (change) =>
          object(change) &&
          timestamp(change.changedAt) &&
          validPlan(change.from) &&
          validPlan(change.to) &&
          typeof change.reason === "string",
      )
    )
      throw new Error(
        "マイルストーンの名前・日付・状態を確認してください。開始日は期限・達成日以前にしてください。",
      );
    ids.add(item.id);
  }
}

export type GanttScale = "week" | "month" | "event";
export function ganttRange(
  event: DanceEvent,
  scale: GanttScale,
  anchor: string,
) {
  if (scale === "week") {
    const week = weekOf(anchor);
    return { start: week.startDate, end: week.endDate };
  }
  if (scale === "month") return monthRange(anchor.slice(0, 7));
  const dates = [
    event.date,
    ...(event.milestones ?? [])
      .flatMap((item) => [
        item.startDate,
        item.dueDate,
        item.baseline?.startDate,
        item.baseline?.dueDate,
        item.actualStartDate,
        item.completedDate,
        item.status === "in_progress" && item.actualStartDate
          ? localDate()
          : undefined,
      ])
      .filter((value): value is string => !!value),
  ].sort();
  return { start: dates[0], end: dates.at(-1)! };
}
// Percentages keep even long event timelines bounded; dates are never rendered as thousands of cells.
export function ganttPosition(
  date: string,
  range: { start: string; end: string },
) {
  return (
    ((daysUntil(date, range.start) + 0.5) /
      (daysUntil(range.end, range.start) + 1)) *
    100
  );
}
export function ganttSegment(
  start: string,
  end: string,
  range: { start: string; end: string },
) {
  if (end < range.start || start > range.end) return undefined;
  const count = daysUntil(range.end, range.start) + 1;
  const left = Math.max(0, daysUntil(start, range.start));
  const right = Math.min(count, daysUntil(end, range.start) + 1);
  return {
    left: `${(left / count) * 100}%`,
    width: `${((right - left) / count) * 100}%`,
  };
}
