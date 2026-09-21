import type { EventWorkItem } from "../types";
import { db } from "./db";
import {
  normalizeEventWork,
  validateEventWork,
  workSchedule,
} from "../lib/eventWork";
import { milestonePlan, updateMilestonePlan } from "../lib/milestones";

export async function saveEventWork(
  eventId: string,
  draft: EventWorkItem,
  reason = "",
  mustExist = false,
) {
  await db.transaction("rw", db.events, async () => {
    const raw = await db.events.get(eventId);
    if (!raw) throw new Error("イベントが見つかりません。");
    const event = normalizeEventWork(raw);
    const items = event.workItems ?? [];
    const previous = items.find((item) => item.id === draft.id);
    if (mustExist && !previous)
      throw new Error("作業が削除されています。一覧を開き直してください。");
    if (previous && previous.updatedAt !== draft.updatedAt)
      throw new Error("作業が別の画面で変更されています。開き直してください。");
    const now = new Date(
      Math.max(
        Date.now(),
        Date.parse(event.updatedAt) + 1,
        previous ? Date.parse(previous.updatedAt) + 1 : 0,
      ),
    ).toISOString();
    const plan = previous
      ? updateMilestonePlan(workSchedule(previous), draft, reason, now)
      : undefined;
    const next: EventWorkItem = {
      ...draft,
      title: draft.title.trim(),
      updatedAt: now,
      baseline: plan
        ? plan.baseline
        : draft.startDate || draft.dueDate
          ? milestonePlan(draft)
          : undefined,
      changes: plan?.changes ?? [],
      completedDate:
        draft.status === "completed" ? draft.completedDate : undefined,
    };
    const updated = {
      ...event,
      updatedAt: now,
      workItems: previous
        ? items.map((item) => (item.id === next.id ? next : item))
        : [...items, next],
    };
    validateEventWork(updated);
    await db.events.put(updated);
  });
}

export async function deleteEventWork(eventId: string, id: string) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    await db.events.put({
      ...event,
      workItems: (event.workItems ?? []).filter((item) => item.id !== id),
      updatedAt: new Date(
        Math.max(Date.now(), Date.parse(event.updatedAt) + 1),
      ).toISOString(),
    });
  });
}
