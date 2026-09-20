import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { allGoals, base, save, savePlanWithFocusGoals } from "./repository";
import {
  goalCategory,
  goalLabel,
  matchesGoalCategory,
} from "../lib/goalCategories";
import { weekOf } from "../lib/dates";
import type { Goal } from "../types";

const makeGoal = (category?: Goal["category"]): Goal => ({
  ...base(),
  title: "姿勢を保つ",
  category,
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
afterAll(() => db.delete());
describe("technical goal categories", () => {
  it("treats legacy goals as general and distinguishes general from all categories", () => {
    expect(goalCategory({})).toBe("general");
    expect(matchesGoalCategory({}, "general")).toBe(true);
    expect(matchesGoalCategory({ category: "rumba" }, "general")).toBe(false);
    expect(matchesGoalCategory({ category: "rumba" }, "all")).toBe(true);
    expect(matchesGoalCategory({}, "latin")).toBe(false);
  });
  it("includes individual dances in their family and supports exact dance filters", () => {
    expect(matchesGoalCategory({ category: "rumba" }, "latin")).toBe(true);
    expect(matchesGoalCategory({ category: "latin" }, "latin")).toBe(true);
    expect(matchesGoalCategory({ category: "waltz" }, "latin")).toBe(false);
    expect(matchesGoalCategory({ category: "waltz" }, "standard")).toBe(true);
    expect(matchesGoalCategory({ category: "rumba" }, "rumba")).toBe(true);
    expect(matchesGoalCategory({ category: "cha_cha" }, "rumba")).toBe(false);
  });
  it("persists category edits without changing goal IDs or event and plan links", async () => {
    const goal = makeGoal();
    await save("goals", goal);
    const event = {
      ...base(),
      title: "大会",
      date: "2026-12-01",
      type: "competition" as const,
      status: "planned" as const,
      goalIds: [goal.id],
    };
    await save("events", event);
    const plan = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [goal.id],
      tasks: [],
    };
    await save("weeklyPlans", plan);
    await save("goals", {
      ...(await db.goals.get(goal.id))!,
      category: "rumba",
    });
    db.close();
    await db.open();
    const [stored] = await allGoals();
    expect(stored.category).toBe("rumba");
    expect(stored.id).toBe(goal.id);
    expect(stored.eventIds).toEqual([event.id]);
    expect((await db.events.get(event.id))?.goalIds).toEqual([goal.id]);
    expect((await db.weeklyPlans.get(plan.id))?.focusGoalIds).toEqual([
      goal.id,
    ]);
    expect(goalLabel(stored)).toBe("ルンバ · 姿勢を保つ");
  });
  it("does not reuse a different-category goal when adding a general goal by title", async () => {
    const rumba = makeGoal("rumba");
    await save("goals", rumba);
    const plan = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [],
      tasks: [],
    };
    const saved = await savePlanWithFocusGoals("weeklyPlans", plan, [
      rumba.title,
    ]);
    expect(saved.focusGoalIds).not.toContain(rumba.id);
    expect(await db.goals.count()).toBe(2);
  });
});
