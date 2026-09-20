import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base } from "./repository";
import { removeUnusedDefaultGoals } from "./migrations";
import type { Goal } from "../types";
const initialize = () =>
  db.transaction("rw", db.tables, removeUnusedDefaultGoals);

const titles = [
  "下半身の強化",
  "頭の安定化",
  "体を使いながらブレない体幹を持つ",
];
async function legacy() {
  const goals: Goal[] = titles.map((title) => ({
    ...base(),
    title,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    status: "not_started",
    priority: "medium",
    progress: 0,
    eventIds: [],
  }));
  await db.goals.bulkAdd(goals);
  await db.settings.put({ id: "initialized", value: true });
  return goals;
}
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(async () => {
  await db.delete();
});

describe("legacy default goal cleanup", () => {
  it("removes old untouched defaults once and preserves a recovery copy", async () => {
    await legacy();
    await initialize();
    expect(await db.goals.count()).toBe(0);
    const marker = await db.settings.get(
      "migration:remove-unused-default-goals-v1",
    );
    expect(
      (marker?.value as { removedGoals: Goal[] }).removedGoals,
    ).toHaveLength(3);
    const custom: Goal = {
      ...base(),
      title: titles[0],
      status: "not_started",
      priority: "medium",
      progress: 0,
      eventIds: [],
    };
    await db.goals.add(custom);
    await initialize();
    expect(await db.goals.get(custom.id)).toEqual(custom);
  });
  it("preserves edited goals and removes only unused originals", async () => {
    const [edited] = await legacy();
    await db.goals.update(edited.id, {
      updatedAt: "2026-09-21T00:00:00.000Z",
      progress: 25,
    });
    await initialize();
    expect(await db.goals.count()).toBe(1);
    expect((await db.goals.get(edited.id))?.progress).toBe(25);
  });
  it("does not remove a user goal based on its title", async () => {
    const [custom] = await legacy();
    await db.goals.where("id").notEqual(custom.id).delete();
    await initialize();
    expect(await db.goals.get(custom.id)).toEqual(custom);
  });
  it.each(["month", "week", "practice", "lesson", "image", "child", "event"])(
    "preserves defaults referenced by %s",
    async (kind) => {
      const [used] = await legacy();
      if (kind === "month")
        await db.monthlyPlans.add({
          ...base(),
          year: 2026,
          month: 9,
          focusGoalIds: [],
          objectives: [
            {
              id: "o",
              title: "到達点",
              goalId: used.id,
              progress: 0,
              completed: false,
            },
          ],
        });
      if (kind === "week")
        await db.weeklyPlans.add({
          ...base(),
          startDate: "2026-09-14",
          endDate: "2026-09-20",
          focusGoalIds: [used.id],
          tasks: [],
        });
      if (kind === "practice")
        await db.practiceLogs.add({
          ...base(),
          date: "2026-09-20",
          practiced: true,
          goalIds: [used.id],
          attachmentIds: [],
        });
      if (kind === "lesson")
        await db.lessons.add({
          ...base(),
          date: "2026-09-20",
          relatedGoalIds: [],
          relatedEventIds: [],
          plannedTopics: [
            { id: "t", title: "確認", priority: "high", goalId: used.id },
          ],
          actualTopics: [],
          attachmentIds: [],
          completed: false,
        });
      if (kind === "image")
        await db.attachments.add({
          id: "a",
          name: "image.png",
          mimeType: "image/png",
          size: 1,
          relatedType: "goal",
          relatedId: used.id,
          createdAt: used.createdAt,
        });
      if (kind === "child")
        await db.goals.add({
          ...used,
          ...base(),
          title: "子目標",
          parentGoalId: used.id,
          createdAt: "2026-09-21T00:00:00.000Z",
          updatedAt: "2026-09-21T00:00:00.000Z",
        });
      if (kind === "event")
        await db.events.add({
          ...base(),
          title: "競技会",
          date: "2026-12-05",
          type: "competition",
          status: "planned",
          goalIds: [used.id],
        });
      await initialize();
      expect(await db.goals.get(used.id)).toEqual(used);
      expect(await db.goals.count()).toBe(kind === "child" ? 2 : 1);
    },
  );
});
