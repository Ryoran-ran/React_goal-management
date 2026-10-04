import type { AiEventScheduleDraft } from "../lib/aiEventSchedule";
import { previewScheduleImport } from "../lib/aiEventSchedule";
import { previewEventScheduleRevision } from "../lib/eventScheduleRevision";
import { validateEventWork, workSchedule } from "../lib/eventWork";
import { updateMilestonePlan, validateMilestones } from "../lib/milestones";
import type { EventWorkItem } from "../types";
import { db } from "./db";

export async function importAiEventSchedule(
  eventId: string,
  expectedUpdatedAt: string,
  draft: AiEventScheduleDraft,
) {
  return db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    if (event.updatedAt !== expectedUpdatedAt)
      throw new Error(
        "イベントが別の画面で変更されています。内容をもう一度確認してください。",
      );
    if (draft.eventTitle !== event.title)
      throw new Error(
        "イベント名が変更されています。AIへの依頼からやり直してください。",
      );
    const dates = [
      ...draft.milestones.map((item) => item.dueDate),
      ...draft.milestones.flatMap((item) =>
        item.workItems.flatMap((work) => [work.startDate, work.dueDate]),
      ),
      ...draft.workItems.flatMap((work) => [work.startDate, work.dueDate]),
    ];
    if (dates.some((date) => date > event.date))
      throw new Error(
        "開催日が変更されています。AIへの依頼からやり直してください。",
      );
    const now = new Date(
      Math.max(Date.now(), Date.parse(event.updatedAt) + 1),
    ).toISOString();
    const revision = previewEventScheduleRevision(event, draft);
    const changeMap = new Map(
      revision.changes.map((change) => [`${change.kind}:${change.id}`, change]),
    );
    const revisedMilestones = (event.milestones ?? []).map((item) => {
      const change = changeMap.get(`milestone:${item.id}`);
      return change
        ? updateMilestonePlan(item, change.to, change.reason, now)
        : item;
    });
    const revisedWorkItems = (event.workItems ?? []).map(
      (item): EventWorkItem => {
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
      },
    );
    const revisedEvent = {
      ...event,
      milestones: revisedMilestones,
      workItems: revisedWorkItems,
    };
    const preview = previewScheduleImport(revisedEvent, draft, now);
    const updated = {
      ...revisedEvent,
      updatedAt: now,
      milestones: [...revisedMilestones, ...preview.milestones],
      workItems: [...revisedWorkItems, ...preview.workItems],
    };
    validateMilestones(updated.milestones);
    validateEventWork(updated);
    if (
      revision.changes.length ||
      preview.milestones.length ||
      preview.workItems.length
    )
      await db.events.put(updated);
    return {
      ...preview,
      changes: revision.changes,
      skippedUnchanged: revision.skippedUnchanged,
    };
  });
}
