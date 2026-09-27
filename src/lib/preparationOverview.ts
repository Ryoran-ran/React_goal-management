import type { EventWorkItem } from "../types";
import { addDays } from "./dates";

export type PreparationWorkGroupId =
  "overdue" | "now" | "later" | "unscheduled";

export interface PreparationWorkGroup {
  id: PreparationWorkGroupId;
  label: string;
  items: EventWorkItem[];
}

const priorityRank = { high: 0, medium: 1, low: 2 };

const workDate = (item: EventWorkItem) => item.dueDate ?? item.startDate;

export function preparationWorkGroups(
  items: EventWorkItem[],
  today: string,
): PreparationWorkGroup[] {
  const weekEnd = addDays(today, 7);
  const groups: Record<PreparationWorkGroupId, EventWorkItem[]> = {
    overdue: [],
    now: [],
    later: [],
    unscheduled: [],
  };

  for (const item of items) {
    if (item.status === "completed") continue;
    const target = workDate(item);
    const inPlannedPeriod =
      !!item.startDate &&
      item.startDate <= today &&
      (!item.dueDate || item.dueDate >= today);

    if (target && target < today) groups.overdue.push(item);
    else if (
      item.status === "in_progress" ||
      inPlannedPeriod ||
      (target && target <= weekEnd)
    )
      groups.now.push(item);
    else if (target) groups.later.push(item);
    else groups.unscheduled.push(item);
  }

  const sort = (a: EventWorkItem, b: EventWorkItem) =>
    (workDate(a) ?? "9999-12-31").localeCompare(workDate(b) ?? "9999-12-31") ||
    priorityRank[a.priority] - priorityRank[b.priority] ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id);

  const labels: Record<PreparationWorkGroupId, string> = {
    overdue: "期限超過",
    now: "今やること",
    later: "この先",
    unscheduled: "日付未設定",
  };

  return (["overdue", "now", "later", "unscheduled"] as const)
    .filter((id) => groups[id].length > 0)
    .map((id) => ({ id, label: labels[id], items: groups[id].sort(sort) }));
}
