import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, home, remove, save, savePlanWithDraftGoals } from "./repository";
import type { Goal } from "../types";

const major = (): Goal => ({
  ...base(),
  title: "自分で決めた大項目",
  status: "not_started",
  priority: "medium",
  progress: 0,
  eventIds: [],
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(async () => {
  await db.delete();
});
describe("major goals and period-specific focus points", () => {
  it("creates a major goal once and keeps separate weekly and monthly details", async () => {
    const goal = major();
    const week = {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [goal.id],
      focusDetails: { [goal.id]: " 最初の一歩で重心を乗せる " },
      tasks: [],
    };
    await savePlanWithDraftGoals("weeklyPlans", week, [goal]);
    const month = {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [goal.id],
      focusDetails: { [goal.id]: "曲の最後まで保つ" },
      objectives: [],
    };
    await savePlanWithDraftGoals("monthlyPlans", month, []);
    expect(await db.goals.count()).toBe(1);
    const overview = await home("2026-09-20");
    expect(overview.weeklyPlan?.focusDetails?.[goal.id]).toBe(
      "最初の一歩で重心を乗せる",
    );
    expect(overview.monthlyPlan?.focusDetails?.[goal.id]).toBe(
      "曲の最後まで保つ",
    );
  });
  it("does not save deselected unused drafts or their detail text", async () => {
    const goal = major();
    const plan = {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [],
      focusDetails: { [goal.id]: "未選択" },
      tasks: [],
    };
    await savePlanWithDraftGoals("weeklyPlans", plan, [goal]);
    expect(await db.goals.count()).toBe(0);
    expect((await db.weeklyPlans.get(plan.id))?.focusDetails).toEqual({});
  });
  it("rolls back draft goals when a duplicate-period plan fails", async () => {
    const goal = major();
    const plan = {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [],
      tasks: [],
    };
    await save("weeklyPlans", plan);
    await expect(
      savePlanWithDraftGoals(
        "weeklyPlans",
        { ...plan, ...base(), focusGoalIds: [goal.id] },
        [goal],
      ),
    ).rejects.toThrow();
    expect(await db.goals.count()).toBe(0);
  });
  it("cleans related detail text when the major goal is deleted", async () => {
    const goal = major();
    const week = {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [goal.id],
      focusDetails: { [goal.id]: "週のポイント" },
      tasks: [],
    };
    await savePlanWithDraftGoals("weeklyPlans", week, [goal]);
    const month = {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [goal.id],
      focusDetails: { [goal.id]: "月のポイント" },
      objectives: [],
    };
    await savePlanWithDraftGoals("monthlyPlans", month, []);
    await remove("goals", goal.id);
    expect((await db.weeklyPlans.get(week.id))?.focusDetails).toEqual({});
    expect((await db.monthlyPlans.get(month.id))?.focusDetails).toEqual({});
  });
  it("preserves old plans without detail fields", async () => {
    const goal = major();
    await save("goals", goal);
    const old = {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [goal.id],
      tasks: [
        {
          id: "task",
          title: "既存の練習",
          goalIds: [goal.id],
          completed: false,
        },
      ],
    };
    await savePlanWithDraftGoals("weeklyPlans", old, []);
    expect((await db.weeklyPlans.get(old.id))?.tasks).toEqual(old.tasks);
    expect((await db.weeklyPlans.get(old.id))?.focusGoalIds).toEqual([goal.id]);
  });
});
