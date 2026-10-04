import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { parseEventScheduleRevision } from "../lib/eventScheduleRevision";
import { db } from "./db";
import { base, save } from "./repository";
import { applyEventScheduleRevision } from "./eventScheduleRevision";

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

const now = "2026-09-01T00:00:00.000Z";
const milestone: EventMilestone = {
  id: "milestone-1",
  createdAt: now,
  updatedAt: now,
  title: "衣装を決める",
  successCriteria: "衣装がそろっている",
  dueDate: "2026-09-20",
  baseline: { dueDate: "2026-09-20" },
  status: "in_progress",
  changes: [],
};
const work: EventWorkItem = {
  id: "work-1",
  createdAt: now,
  updatedAt: now,
  title: "衣装を試着する",
  description: "動きやすさを確認する",
  priority: "high",
  startDate: "2026-09-10",
  dueDate: "2026-09-15",
  baseline: { startDate: "2026-09-10", dueDate: "2026-09-15" },
  status: "not_started",
  changes: [],
};

async function storedEvent() {
  const event: DanceEvent = {
    ...base(),
    title: "秋の発表会",
    type: "performance",
    date: "2026-10-10",
    status: "active",
    goalIds: [],
    milestones: [milestone],
    workItems: [work],
  };
  await save("events", event);
  return (await db.events.get(event.id))!;
}

describe("AIと相談した予定変更の反映", () => {
  it("複数の日付を一括変更し、当初予定と変更理由を残す", async () => {
    const event = await storedEvent();
    const draft = parseEventScheduleRevision(
      JSON.stringify({
        eventTitle: event.title,
        changes: [
          {
            kind: "milestone",
            id: milestone.id,
            startDate: null,
            dueDate: "2026-09-27",
            reason: "衣装の到着が遅れたため",
          },
          {
            kind: "work",
            id: work.id,
            startDate: "2026-09-17",
            dueDate: "2026-09-22",
            reason: "到着後に試着するため",
          },
        ],
      }),
      event,
    );
    const result = await applyEventScheduleRevision(
      event.id,
      event.updatedAt,
      draft,
    );
    const revised = (await db.events.get(event.id))!;
    expect(result.changes).toHaveLength(2);
    expect(revised.milestones?.[0].dueDate).toBe("2026-09-27");
    expect(revised.milestones?.[0].baseline).toEqual(milestone.baseline);
    expect(revised.milestones?.[0].changes[0].reason).toBe(
      "衣装の到着が遅れたため",
    );
    expect(revised.workItems?.[0].startDate).toBe("2026-09-17");
    expect(revised.workItems?.[0].baseline).toEqual(work.baseline);
    expect(revised.workItems?.[0].changes[0].reason).toBe(
      "到着後に試着するため",
    );
  });

  it("相談後にイベントが更新されていたら反映しない", async () => {
    const event = await storedEvent();
    const draft = parseEventScheduleRevision(
      JSON.stringify({ eventTitle: event.title, changes: [] }),
      event,
    );
    await db.events.update(event.id, { updatedAt: "2099-01-01T00:00:00.000Z" });
    await expect(
      applyEventScheduleRevision(event.id, event.updatedAt, draft),
    ).rejects.toThrow("別の画面");
  });
});
