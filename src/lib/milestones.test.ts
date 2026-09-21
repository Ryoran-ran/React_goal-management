import { describe, expect, it } from "vitest";
import type { DanceEvent, EventMilestone } from "../types";
import {
  ganttPosition,
  ganttRange,
  ganttSegment,
  milestonePlanDelay,
  milestoneTiming,
  nextMilestone,
  shiftMilestones,
  updateMilestonePlan,
  validateMilestones,
  milestoneTaskProgress,
} from "./milestones";
const base = {
  id: "m",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const milestone = (): EventMilestone => ({
  ...base,
  title: "振り付けを覚える",
  successCriteria: "見本なしで通せる",
  status: "not_started",
  startDate: "2026-09-01",
  dueDate: "2026-09-20",
  changes: [],
});
const event = (items: EventMilestone[]): DanceEvent => ({
  ...base,
  title: "大会",
  type: "competition",
  date: "2026-10-25",
  status: "planned",
  goalIds: [],
  milestones: items,
});
describe("milestone planning", () => {
  it("accepts legacy milestones and validates work items and their progress", () => {
    expect(() => validateMilestones([milestone()])).not.toThrow();
    expect(milestoneTaskProgress(milestone())).toEqual({
      completed: 0,
      total: 0,
    });
    const task = { id: "a", title: "前半を覚える", completed: false };
    const withTasks = {
      ...milestone(),
      tasks: [task, { ...task, id: "b", completed: true }],
    };
    expect(() => validateMilestones([withTasks])).not.toThrow();
    expect(milestoneTaskProgress(withTasks)).toEqual({
      completed: 1,
      total: 2,
    });
    for (const tasks of [
      null,
      {},
      [task, task],
      [{ ...task, title: " " }],
      [{ ...task, completed: "false" }],
      [{ ...task, title: "a".repeat(201) }],
    ]) {
      expect(() => validateMilestones([{ ...milestone(), tasks }])).toThrow();
    }
    expect(shiftMilestones([withTasks], 7)[0].tasks).toEqual(withTasks.tasks);
  });
  it("keeps the first baseline across replanning and clearing dates", () => {
    const original = milestone();
    const changed = updateMilestonePlan(
      original,
      { startDate: "2026-09-05", dueDate: "2026-09-27" },
      "振り付け変更",
    );
    expect(changed.baseline).toEqual({
      startDate: "2026-09-01",
      dueDate: "2026-09-20",
    });
    expect(changed.changes[0].reason).toBe("振り付け変更");
    expect(milestonePlanDelay(changed)).toBe(7);
    const cleared = updateMilestonePlan(changed, {}, "後で調整");
    expect(cleared.baseline).toEqual(changed.baseline);
    expect(cleared.changes).toHaveLength(2);
    expect(cleared.dueDate).toBeUndefined();
    expect(original.dueDate).toBe("2026-09-20");
  });
  it("moves only unfinished plans and leaves actual dates and baselines untouched", () => {
    const active = {
      ...milestone(),
      status: "in_progress" as const,
      actualStartDate: "2026-09-03",
    };
    const done = {
      ...milestone(),
      id: "done",
      status: "achieved" as const,
      completedDate: "2026-09-19",
    };
    const skipped = { ...milestone(), id: "skip", status: "skipped" as const };
    const [moved, kept, skippedKept] = shiftMilestones(
      [active, done, skipped],
      7,
    );
    expect(moved.dueDate).toBe("2026-09-27");
    expect(moved.actualStartDate).toBe("2026-09-03");
    expect(moved.baseline?.dueDate).toBe("2026-09-20");
    expect(kept).toEqual(done);
    expect(skippedKept).toEqual(skipped);
    expect(shiftMilestones([moved], 0)[0].changes).toHaveLength(1);
  });
  it("distinguishes overdue, due today, late completion and unfinished dates", () => {
    expect(milestoneTiming(milestone(), "2026-09-21")).toBe("期限超過 1日");
    expect(milestoneTiming(milestone(), "2026-09-20")).toBe("今日が期限");
    expect(milestoneTiming(milestone(), "2026-09-19")).toBe("あと1日");
    expect(
      milestoneTiming({
        ...milestone(),
        status: "achieved",
        completedDate: "2026-09-23",
      }),
    ).toBe("3日遅れて達成");
    expect(milestoneTiming({ ...milestone(), dueDate: undefined })).toBe(
      "期限未設定",
    );
    expect(milestoneTiming({ ...milestone(), status: "skipped" })).toBe(
      "見送り",
    );
  });
  it("chooses the next unfinished deadline without inferring completion from dates", () => {
    const items = [
      { ...milestone(), id: "undated", dueDate: undefined },
      {
        ...milestone(),
        id: "done",
        status: "achieved" as const,
        completedDate: "2026-09-19",
      },
      { ...milestone(), id: "next", dueDate: "2026-09-27" },
      { ...milestone(), id: "overdue", dueDate: "2026-09-18" },
    ];
    expect(nextMilestone(event(items))?.id).toBe("overdue");
    expect(nextMilestone(event([]))).toBeUndefined();
  });
  it("validates duplicate IDs, real dates, ordering and completed dates", () => {
    expect(() => validateMilestones([milestone()])).not.toThrow();
    expect(() => validateMilestones([milestone(), milestone()])).toThrow();
    for (const patch of [
      { title: " " },
      { dueDate: "2026-02-30" },
      { startDate: "2026-10-01" },
      { status: "achieved" },
      { completedDate: "2026-09-19" },
      { changes: [{ changedAt: "bad" }] },
    ]) {
      expect(() =>
        validateMilestones([{ ...milestone(), ...patch }]),
      ).toThrow();
    }
    expect(() =>
      validateMilestones([
        {
          ...milestone(),
          status: "achieved",
          actualStartDate: "2026-09-20",
          completedDate: "2026-09-19",
        },
      ]),
    ).toThrow();
  });
});
describe("gantt dates", () => {
  it("includes first plans and actual completion in the full event range", () => {
    const item = {
      ...milestone(),
      baseline: { startDate: "2026-08-20", dueDate: "2026-09-01" },
      status: "achieved" as const,
      completedDate: "2026-11-02",
    };
    expect(ganttRange(event([item]), "event", "2026-09-21")).toEqual({
      start: "2026-08-20",
      end: "2026-11-02",
    });
    expect(ganttRange(event([]), "week", "2026-09-21")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    expect(ganttRange(event([]), "month", "2024-02-03")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });
  it("clips partial bars at range edges and keeps single-day milestones finite", () => {
    const range = { start: "2026-09-01", end: "2026-09-10" };
    expect(ganttSegment("2026-08-01", "2026-09-02", range)).toEqual({
      left: "0%",
      width: "20%",
    });
    expect(ganttSegment("2026-09-09", "2026-10-01", range)).toEqual({
      left: "80%",
      width: "20%",
    });
    expect(ganttSegment("2026-10-01", "2026-10-02", range)).toBeUndefined();
    expect(ganttPosition("2026-09-01", range)).toBe(5);
    expect(
      ganttPosition("2026-09-01", { start: "2026-09-01", end: "2026-09-01" }),
    ).toBe(50);
  });
});
