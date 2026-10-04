import type { EventWorkItem } from "../types";
import {
  previewEventScheduleRevision,
  type EventScheduleRevisionDraft,
} from "../lib/eventScheduleRevision";
import { validateEventWork, workSchedule } from "../lib/eventWork";
import { updateMilestonePlan, validateMilestones } from "../lib/milestones";
import { db } from "./db";

export async function applyEventScheduleRevision(
  eventId: string,
  expectedUpdatedAt: string,
  draft: EventScheduleRevisionDraft,
) {
  return db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    if (event.updatedAt !== expectedUpdatedAt)
      throw new Error(
        "イベントが別の画面で変更されています。AIへの相談からやり直してください。",
      );
    if (draft.eventTitle !== event.title)
      throw new Error(
        "イベント名が変更されています。AIへの相談からやり直してください。",
      );
    const preview = previewEventScheduleRevision(event, draft);
    if (!preview.changes.length) return preview;
    const now = new Date(
      Math.max(Date.now(), Date.parse(event.updatedAt) + 1),
    ).toISOString();
    const changeMap = new Map(
      preview.changes.map((change) => [`${change.kind}:${change.id}`, change]),
    );
    const milestones = (event.milestones ?? []).map((item) => {
      const change = changeMap.get(`milestone:${item.id}`);
      return change
        ? updateMilestonePlan(item, change.to, change.reason, now)
        : item;
    });
    const workItems = (event.workItems ?? []).map((item): EventWorkItem => {
      const change = changeMap.get(`work:${item.id}`);
      if (!change) return item;
      const plan = updateMilestonePlan(
        workSchedule(item),
        change.to,
        change.reason,
        now,
      );
      return {
        ...item,
        startDate: plan.startDate,
        dueDate: plan.dueDate,
        baseline: plan.baseline,
        changes: plan.changes,
        updatedAt: now,
      };
    });
    validateMilestones(milestones);
    validateEventWork({ milestones, workItems });
    await db.events.put({ ...event, milestones, workItems, updatedAt: now });
    return preview;
  });
}
