import { describe, expect, it } from "vitest";
import type { Goal } from "../types";
import { reviewGoals, type GoalFilters } from "./goalReview";

const filters: GoalFilters = {
  category: "all",
  priority: "all",
  status: "all",
  search: "",
};
const goal = (id: string, changes: Partial<Goal> = {}): Goal => ({
  id,
  createdAt: "",
  updatedAt: "",
  title: id,
  category: "rumba",
  priority: "medium",
  status: "not_started",
  progress: 0,
  eventIds: [],
  ...changes,
});
describe("goal review", () => {
  it("combines family, priority, status and text filters", () => {
    const goals = [
      goal("a", {
        priority: "high",
        description: "頭を安定させる",
        status: "in_progress",
      }),
      goal("b", {
        priority: "high",
        category: "waltz",
        description: "頭を安定させる",
        status: "in_progress",
      }),
      goal("c", {
        priority: "high",
        description: "頭を安定させる",
        status: "achieved",
      }),
    ];
    expect(
      reviewGoals(goals, {
        category: "latin",
        priority: "high",
        status: "in_progress",
        search: "頭 安定",
      }).map((item) => item.id),
    ).toEqual(["a"]);
  });
  it("searches criteria and notes with normalized characters and keeps legacy goals visible", () => {
    const old = goal("old", {
      category: undefined,
      successCriteria: "ABCを3回",
      description: "床を使う",
    });
    expect(
      reviewGoals([old], {
        ...filters,
        category: "general",
        search: "ａｂｃ　床",
      }),
    ).toEqual([old]);
  });
  it("sorts by priority without mutating stored order and excludes achieved goals on request", () => {
    const goals = [
      goal("low", { priority: "low" }),
      goal("done", { status: "achieved", priority: "high" }),
      goal("high", { priority: "high" }),
    ];
    expect(
      reviewGoals(goals, { ...filters, status: "unfinished" }).map(
        (item) => item.id,
      ),
    ).toEqual(["high", "low"]);
    expect(goals.map((item) => item.id)).toEqual(["low", "done", "high"]);
  });
});
