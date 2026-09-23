import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { updateMilestonePlan, validateMilestones } from "./milestones";
import { addDays, localDate } from "./dates";

export const workStatuses = {
  not_started: "未着手",
  in_progress: "取り組み中",
  completed: "完了",
};
export const workPriorities = { high: "高", medium: "中", low: "低" };

export const sortedEventWork = (items: EventWorkItem[]) =>
  [...items].sort(
    (a, b) =>
      (a.startDate ?? "9999-12-31").localeCompare(
        b.startDate ?? "9999-12-31",
      ) ||
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );

export function withWorkStatus(
  work: EventWorkItem,
  status: EventWorkItem["status"],
  today = localDate(),
): EventWorkItem {
  return {
    ...work,
    status,
    actualStartDate:
      status === "in_progress"
        ? (work.actualStartDate ?? today)
        : status === "not_started"
          ? undefined
          : work.actualStartDate,
    completedDate:
      status === "completed" ? (work.completedDate ?? today) : undefined,
  };
}

// Common schedule calculations use the same dates and baseline rules for both kinds.
export const workSchedule = (work: EventWorkItem): EventMilestone => ({
  ...work,
  dueDate: work.dueDate ?? work.startDate,
  successCriteria: work.description,
  status: work.status === "completed" ? "achieved" : work.status,
});
export const workProgress = (workItems: EventWorkItem[]) => ({
  completed: workItems.filter((work) => work.status === "completed").length,
  total: workItems.length,
});
export type TodayEventWorkTiming =
  "today" | "starts_today" | "due_today" | "in_period" | "overdue";
export interface TodayEventWork {
  event: DanceEvent;
  work: EventWorkItem;
  timing: TodayEventWorkTiming;
}
export function visibleGanttSchedule(event: DanceEvent, showFinished: boolean) {
  if (showFinished)
    return {
      milestones: event.milestones ?? [],
      workItems: event.workItems ?? [],
    };
  const workItems = (event.workItems ?? []).filter(
    (work) => work.status !== "completed",
  );
  const milestonesWithOpenWork = new Set(
    workItems
      .map((work) => work.milestoneId)
      .filter((id): id is string => !!id),
  );
  const milestones = (event.milestones ?? []).filter(
    (milestone) =>
      (milestone.status !== "achieved" && milestone.status !== "skipped") ||
      milestonesWithOpenWork.has(milestone.id),
  );
  return { milestones, workItems };
}
export function eventWorkForToday(
  events: DanceEvent[],
  today: string,
): TodayEventWork[] {
  const timingRank: Record<TodayEventWorkTiming, number> = {
    today: 0,
    due_today: 1,
    starts_today: 2,
    in_period: 3,
    overdue: 4,
  };
  return events
    .flatMap((event) =>
      (event.workItems ?? []).flatMap((work): TodayEventWork[] => {
        if (work.status === "completed") return [];
        const start = work.startDate ?? work.dueDate;
        const end = work.dueDate ?? work.startDate;
        if (!start || !end || start > today || end < today) {
          if (end && end < today) return [{ event, work, timing: "overdue" }];
          return [];
        }
        const timing: TodayEventWorkTiming =
          start === today && end === today
            ? "today"
            : end === today
              ? "due_today"
              : start === today
                ? "starts_today"
                : "in_period";
        return [{ event, work, timing }];
      }),
    )
    .sort(
      (a, b) =>
        timingRank[a.timing] - timingRank[b.timing] ||
        (a.work.dueDate ?? a.work.startDate ?? "").localeCompare(
          b.work.dueDate ?? b.work.startDate ?? "",
        ) ||
        a.event.date.localeCompare(b.event.date) ||
        a.work.title.localeCompare(b.work.title, "ja"),
    );
}
export function shiftEventWork(items: EventWorkItem[], days: number) {
  return items.map((item) => {
    if (item.status === "completed") return item;
    const plan = updateMilestonePlan(
      workSchedule(item),
      {
        startDate: item.startDate ? addDays(item.startDate, days) : undefined,
        dueDate: item.dueDate ? addDays(item.dueDate, days) : undefined,
      },
      "イベント開催日の変更",
    );
    return {
      ...item,
      startDate: plan.startDate,
      dueDate: plan.dueDate,
      baseline: plan.baseline,
      changes: plan.changes,
      updatedAt: plan.updatedAt,
    };
  });
}
export function validateEventWork(
  event: Pick<DanceEvent, "milestones" | "workItems">,
) {
  if (event.workItems === undefined) return;
  if (!Array.isArray(event.workItems))
    throw new Error("作業の形式が正しくありません。");
  const ids = new Set<string>();
  for (const work of event.workItems) {
    if (
      !work ||
      typeof work !== "object" ||
      ids.has(work.id) ||
      !Object.hasOwn(workStatuses, work.status) ||
      !Object.hasOwn(workPriorities, work.priority) ||
      typeof work.description !== "string" ||
      typeof work.title !== "string" ||
      work.title.length > 200 ||
      (work.milestoneId !== undefined &&
        (typeof work.milestoneId !== "string" ||
          !(event.milestones ?? []).some(
            (item) => item.id === work.milestoneId,
          )))
    )
      throw new Error(
        "作業名・状態・関連するマイルストーンを確認してください。",
      );
    const schedule = workSchedule(work);
    validateMilestones([
      {
        ...schedule,
        status:
          work.status === "completed" && !work.completedDate
            ? "not_started"
            : schedule.status,
      },
    ]);
    ids.add(work.id);
  }
}

/** Pure, repeatable conversion: no liveQuery writes and no invented work dates. */
export function normalizeEventWork(event: DanceEvent): DanceEvent {
  if (!(event.milestones ?? []).some((item) => item.tasks !== undefined))
    return event;
  const workItems = [...(event.workItems ?? [])];
  const ids = new Set(workItems.map((item) => item.id));
  const milestones = (event.milestones ?? []).map((milestone) => {
    const { tasks, ...rest } = milestone;
    for (const task of tasks ?? []) {
      const seed = `legacy-work:${JSON.stringify([milestone.id, task.id])}`;
      let id = seed,
        suffix = 1;
      while (ids.has(id)) id = `${seed}:${suffix++}`;
      ids.add(id);
      workItems.push({
        id,
        milestoneId: milestone.id,
        title: task.title,
        description: "",
        priority: "medium",
        status: task.completed ? "completed" : "not_started",
        createdAt: milestone.createdAt,
        updatedAt: milestone.updatedAt,
        // Legacy checks did not record completion dates. Preserve that uncertainty.
        changes: [],
      });
    }
    return rest;
  });
  return { ...event, milestones, workItems };
}
