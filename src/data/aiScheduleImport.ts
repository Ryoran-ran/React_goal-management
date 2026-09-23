import type { AiEventScheduleDraft } from "../lib/aiEventSchedule";
import { previewScheduleImport } from "../lib/aiEventSchedule";
import { validateEventWork } from "../lib/eventWork";
import { validateMilestones } from "../lib/milestones";
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
    const preview = previewScheduleImport(event, draft, now);
    const updated = {
      ...event,
      updatedAt: now,
      milestones: [...(event.milestones ?? []), ...preview.milestones],
      workItems: [...(event.workItems ?? []), ...preview.workItems],
    };
    validateMilestones(updated.milestones);
    validateEventWork(updated);
    if (preview.milestones.length || preview.workItems.length)
      await db.events.put(updated);
    return preview;
  });
}
