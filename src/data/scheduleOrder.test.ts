import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, save } from "./repository";
import { reorderSchedule } from "./scheduleOrder";
import { sortedMilestones, validateMilestones } from "../lib/milestones";
import { sortedEventWork, validateEventWork } from "../lib/eventWork";
import { createBackup, readBackup, restoreBackup } from "./backup";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";

beforeEach(async () => {
  for (const table of db.tables) await table.clear();
});
afterAll(() => db.delete());
const milestone = (id: string, dueDate?: string): EventMilestone => ({
  ...base(),
  id,
  title: id,
  dueDate,
  status: "not_started",
  successCriteria: "確認する",
  changes: [],
});
const work = (
  id: string,
  milestoneId: string,
  startDate?: string,
): EventWorkItem => ({
  ...base(),
  id,
  title: id,
  milestoneId,
  startDate,
  dueDate: startDate,
  description: "内容",
  priority: "medium",
  status: "not_started",
  changes: [],
  baseline: startDate ? { startDate, dueDate: startDate } : undefined,
});
async function setup() {
  const event: DanceEvent = {
    ...base(),
    title: "大会",
    date: "2026-10-25",
    type: "competition",
    status: "planned",
    goalIds: [],
    milestones: [
      milestone("a", "2026-10-01"),
      milestone("b", "2026-10-01"),
      milestone("early", "2026-09-01"),
      milestone("none"),
    ],
    workItems: [
      work("one", "a", "2026-09-01"),
      work("two", "a", "2026-09-01"),
      work("late", "a", "2026-09-02"),
      work("other", "b", "2026-09-01"),
      work("blank1", "a"),
      work("blank2", "a"),
    ],
  };
  await save("events", event);
  return event;
}
const get = async (id: string) => (await db.events.get(id))!;
describe("schedule order within matching dates", () => {
  it("persists milestone order without overriding date order or schedule history", async () => {
    const event = await setup();
    const [a, b] = event.milestones!;
    await reorderSchedule(
      event.id,
      "milestone",
      b.id,
      a.id,
      b.updatedAt,
      a.updatedAt,
    );
    const saved = await get(event.id);
    expect(sortedMilestones(saved.milestones!).map((item) => item.id)).toEqual([
      "early",
      "b",
      "a",
      "none",
    ]);
    expect(saved.workItems).toEqual(event.workItems);
    expect(saved.milestones![0].dueDate).toBe(a.dueDate);
    expect(saved.milestones![0].changes).toEqual(a.changes);
    const backup = await readBackup(await createBackup());
    await db.events.clear();
    await restoreBackup(backup);
    expect(
      sortedMilestones((await get(event.id)).milestones!).map(
        (item) => item.id,
      ),
    ).toEqual(["early", "b", "a", "none"]);
  });
  it("reorders sibling work and undated work while preserving dates and other parents", async () => {
    const event = await setup();
    const [one, two, , , blank1, blank2] = event.workItems!;
    await reorderSchedule(
      event.id,
      "work",
      two.id,
      one.id,
      two.updatedAt,
      one.updatedAt,
    );
    await reorderSchedule(
      event.id,
      "work",
      blank2.id,
      blank1.id,
      blank2.updatedAt,
      blank1.updatedAt,
    );
    const saved = await get(event.id);
    expect(
      sortedEventWork(
        saved.workItems!.filter((item) => item.milestoneId === "a"),
      ).map((item) => item.id),
    ).toEqual(["two", "one", "late", "blank2", "blank1"]);
    expect(saved.workItems![0].baseline).toEqual(one.baseline);
    expect(saved.workItems![0].changes).toEqual(one.changes);
    expect(saved.workItems![3]).toEqual(event.workItems![3]);
    expect(saved.milestones).toEqual(event.milestones);
    const backup = await readBackup(await createBackup());
    await db.events.clear();
    await restoreBackup(backup);
    expect((await get(event.id)).workItems).toEqual(saved.workItems);
  });
  it("rejects cross-date, cross-parent and stale moves without writing", async () => {
    const event = await setup();
    const [one, two, late, other] = event.workItems!;
    const before = await get(event.id);
    for (const neighbor of [late, other]) {
      await expect(
        reorderSchedule(
          event.id,
          "work",
          one.id,
          neighbor.id,
          one.updatedAt,
          neighbor.updatedAt,
        ),
      ).rejects.toThrow("同じ日付");
      expect(await get(event.id)).toEqual(before);
    }
    await expect(
      reorderSchedule(
        event.id,
        "work",
        one.id,
        "missing",
        one.updatedAt,
        one.updatedAt,
      ),
    ).rejects.toThrow("削除");
    await reorderSchedule(
      event.id,
      "work",
      one.id,
      two.id,
      one.updatedAt,
      two.updatedAt,
    );
    const reordered = await get(event.id);
    await expect(
      reorderSchedule(
        event.id,
        "work",
        one.id,
        two.id,
        one.updatedAt,
        two.updatedAt,
      ),
    ).rejects.toThrow("変更");
    expect(await get(event.id)).toEqual(reordered);
  });
  it("validates optional ordering and leaves the source arrays untouched when sorting", async () => {
    const event = await setup();
    const original = structuredClone(event);
    sortedMilestones(event.milestones!);
    sortedEventWork(event.workItems!);
    expect(event).toEqual(original);
    for (const sortOrder of [-1, NaN, 1.5, Infinity]) {
      expect(() =>
        validateMilestones([{ ...event.milestones![0], sortOrder }]),
      ).toThrow();
      expect(() =>
        validateEventWork({
          ...event,
          workItems: [{ ...event.workItems![0], sortOrder }],
        }),
      ).toThrow();
    }
  });
});
