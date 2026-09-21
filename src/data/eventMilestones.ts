import type { DanceEvent, EventMilestone } from "../types";
import { db } from "./db";
import { save } from "./repository";
import { daysUntil, localDate } from "../lib/dates";
import { normalizeEventWork, shiftEventWork } from "../lib/eventWork";
import {
  milestonePlan,
  shiftMilestones,
  updateMilestonePlan,
  validateMilestones,
  unfinished,
  sortedMilestones,
} from "../lib/milestones";

export async function saveEventMilestone(
  eventId: string,
  draft: EventMilestone,
  reason = "",
  mustExist = false,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    const items = event.milestones ?? [];
    const previous = items.find((item) => item.id === draft.id);
    if (mustExist && !previous)
      throw new Error(
        "マイルストーンが削除されています。一覧を開き直してください。",
      );
    if (previous && previous.updatedAt !== draft.updatedAt)
      throw new Error("別の画面で変更されています。開き直してください。");
    const now = new Date(
      Math.max(
        Date.now(),
        Date.parse(event.updatedAt) + 1,
        previous ? Date.parse(previous.updatedAt) + 1 : 0,
      ),
    ).toISOString();
    let next: EventMilestone = {
      ...draft,
      title: draft.title.trim(),
      tasks: draft.tasks?.map((task) => ({
        ...task,
        title: task.title.trim(),
      })),
      updatedAt: now,
    };
    if (previous) {
      const plan = updateMilestonePlan(previous, draft, reason, now);
      next = { ...next, baseline: plan.baseline, changes: plan.changes };
    } else
      next = {
        ...next,
        baseline:
          draft.startDate || draft.dueDate ? milestonePlan(draft) : undefined,
        changes: [],
      };
    if (next.status === "achieved") next.completedDate ||= localDate();
    else delete next.completedDate;
    const milestones = previous
      ? items.map((item) => (item.id === next.id ? next : item))
      : [...items, next];
    validateMilestones(milestones);
    await db.events.put({ ...event, milestones, updatedAt: now });
  });
}
export async function setMilestoneTaskCompleted(
  eventId: string,
  milestoneId: string,
  taskId: string,
  completed: boolean,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    const item = event.milestones?.find((value) => value.id === milestoneId);
    const task = item?.tasks?.find((value) => value.id === taskId);
    if (!item || !task)
      throw new Error("作業が削除されています。一覧を開き直してください。");
    if (task.completed === completed) return;
    const now = new Date(
      Math.max(
        Date.now(),
        Date.parse(event.updatedAt) + 1,
        Date.parse(item.updatedAt) + 1,
      ),
    ).toISOString();
    const milestones = event.milestones!.map((value) =>
      value.id === milestoneId
        ? {
            ...value,
            updatedAt: now,
            tasks: value.tasks!.map((entry) =>
              entry.id === taskId ? { ...entry, completed } : entry,
            ),
          }
        : value,
    );
    validateMilestones(milestones);
    await db.events.put({ ...event, milestones, updatedAt: now });
  });
}
export async function deleteEventMilestone(eventId: string, id: string) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    const normalized = normalizeEventWork(event);
    await db.events.put({
      ...normalized,
      milestones: (normalized.milestones ?? []).filter(
        (item) => item.id !== id,
      ),
      workItems: normalized.workItems?.map((item) =>
        item.milestoneId === id
          ? {
              ...item,
              milestoneId: undefined,
              updatedAt: new Date(
                Math.max(Date.now(), Date.parse(item.updatedAt) + 1),
              ).toISOString(),
            }
          : item,
      ),
      updatedAt: new Date().toISOString(),
    });
  });
}
export async function saveEventDetails(
  event: DanceEvent,
  files: File[],
  removed: string[],
  shift: boolean,
) {
  await db.transaction("rw", db.tables, async () => {
    const previous = await db.events.get(event.id);
    if (previous && previous.updatedAt !== event.updatedAt)
      throw new Error(
        "イベントが別の画面で変更されています。開き直してください。",
      );
    const milestones = previous?.milestones ?? event.milestones;
    const workItems = previous?.workItems ?? event.workItems;
    await save(
      "events",
      {
        ...event,
        workItems:
          shift && previous && workItems
            ? shiftEventWork(workItems, daysUntil(event.date, previous.date))
            : workItems,
        milestones:
          shift && previous && milestones
            ? shiftMilestones(milestones, daysUntil(event.date, previous.date))
            : milestones,
      },
      files,
      removed,
    );
  });
}
export async function milestoneDeadlines(start: string, end: string) {
  const events = await db.events.toArray();
  return events
    .filter((event) => event.status === "planned" || event.status === "active")
    .flatMap((event) =>
      sortedMilestones(event.milestones ?? [])
        .filter(
          (item) =>
            unfinished(item) &&
            item.dueDate &&
            item.dueDate >= start &&
            item.dueDate <= end,
        )
        .map((item) => ({
          eventId: event.id,
          eventTitle: event.title,
          milestone: item,
        })),
    )
    .sort((a, b) => a.milestone.dueDate!.localeCompare(b.milestone.dueDate!));
}
