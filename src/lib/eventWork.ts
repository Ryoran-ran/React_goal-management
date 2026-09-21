import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { updateMilestonePlan, validateMilestones } from "./milestones";
import { addDays, localDate } from "./dates";

export const workStatuses = {
  not_started: "未着手",
  in_progress: "取り組み中",
  completed: "完了",
};
export const workPriorities = { high: "高", medium: "中", low: "低" };

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
