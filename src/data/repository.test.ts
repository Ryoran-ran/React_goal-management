import "fake-indexeddb/auto";
import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "./db";
import {
  base,
  initialize,
  save,
  remove,
  home,
  toggleTask,
  list,
  savePlanWithFocusGoals,
} from "./repository";
import type { DanceEvent, Goal, Lesson, PracticeLog } from "../types";
import { weekOf } from "../lib/dates";
const goal = (title = "体幹"): Goal => ({
  ...base(),
  title,
  status: "not_started",
  priority: "medium",
  progress: 0,
  eventIds: [],
});
const event = (): DanceEvent => ({
  ...base(),
  title: "テスト大会",
  type: "competition",
  date: "2026-12-05",
  status: "planned",
  goalIds: [],
});
const lesson = (): Lesson => ({
  ...base(),
  date: "2026-09-24",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  completed: false,
});
const practice = (): PracticeLog => ({
  ...base(),
  date: "2026-09-20",
  practiced: true,
  durationMinutes: 20,
  goalIds: [],
  attachmentIds: [],
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(async () => {
  await db.delete();
});
describe("local repository", () => {
  it("initializes without preset goals and preserves user goals", async () => {
    await initialize();
    await initialize();
    expect(await db.goals.count()).toBe(0);
    const custom = goal("自分で決めた目標");
    await save("goals", custom);
    await initialize();
    expect((await db.goals.get(custom.id))?.title).toBe(custom.title);
    await db.goals.clear();
    await initialize();
    expect(await db.goals.count()).toBe(0);
  });
  it("saves freely entered weekly focus goals and displays them on home", async () => {
    const plan = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [],
      tasks: [],
    };
    const stored = await savePlanWithFocusGoals("weeklyPlans", plan, [
      " 音楽に合わせて踊る ",
      "",
      "音楽に合わせて踊る",
      "苦手なステップをつなぐ",
    ]);
    expect(stored.focusGoalIds).toHaveLength(2);
    const overview = await home("2026-09-20");
    expect(overview.weeklyPlan?.focusGoalIds).toEqual(stored.focusGoalIds);
    expect(overview.goals.map((g) => g.title).sort()).toEqual(
      ["音楽に合わせて踊る", "苦手なステップをつなぐ"].sort(),
    );
  });
  it("reuses existing goals for monthly focus and allows deselection", async () => {
    const existing = goal("リズムを保つ");
    await save("goals", existing);
    const plan = {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [],
      objectives: [],
    };
    const stored = await savePlanWithFocusGoals("monthlyPlans", plan, [
      existing.title,
    ]);
    expect(stored.focusGoalIds).toEqual([existing.id]);
    expect(await db.goals.count()).toBe(1);
    await savePlanWithFocusGoals(
      "monthlyPlans",
      { ...stored, focusGoalIds: [] },
      [],
    );
    expect((await db.monthlyPlans.get(plan.id))?.focusGoalIds).toEqual([]);
    expect(await db.goals.count()).toBe(1);
  });
  it("rolls back new focus goals when the plan cannot be saved", async () => {
    const plan = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [],
      tasks: [],
    };
    await save("weeklyPlans", plan);
    await expect(
      savePlanWithFocusGoals("weeklyPlans", { ...plan, ...base() }, [
        "保存されない目標",
      ]),
    ).rejects.toThrow();
    expect(await db.goals.count()).toBe(0);
  });
  it("maintains many-to-many event links from either editor", async () => {
    const g = goal();
    const e1 = event();
    const e2 = event();
    await save("goals", g);
    await save("events", { ...e1, goalIds: [g.id] });
    await save("events", { ...e2, goalIds: [g.id] });
    expect((await db.goals.get(g.id))?.eventIds.sort()).toEqual(
      [e1.id, e2.id].sort(),
    );
    await save("goals", { ...g, eventIds: [e2.id] });
    expect((await db.events.get(e1.id))?.goalIds).toEqual([]);
    expect((await db.events.get(e2.id))?.goalIds).toEqual([g.id]);
  });
  it("rolls back a cyclic parent update", async () => {
    const a = goal("a");
    const b = { ...goal("b"), parentGoalId: a.id };
    await save("goals", a);
    await save("goals", b);
    await expect(save("goals", { ...a, parentGoalId: b.id })).rejects.toThrow(
      "循環",
    );
    expect((await db.goals.get(a.id))?.parentGoalId).toBeUndefined();
  });
  it("stores images separately and removes them with their owner", async () => {
    const p = practice();
    const file = new File(["image-test"], "test.png", { type: "image/png" });
    await save("practiceLogs", p, [file]);
    const stored = await db.practiceLogs.get(p.id);
    expect(stored?.attachmentIds).toHaveLength(1);
    const id = stored!.attachmentIds[0];
    expect((await db.attachmentFiles.get(id))?.blob.size).toBe(file.size);
    await remove("practiceLogs", p.id);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentFiles.count()).toBe(0);
  });
  it("rejects non-image files without saving the record", async () => {
    await expect(
      save("practiceLogs", practice(), [
        new File(["x"], "bad.svg", { type: "image/svg+xml" }),
      ]),
    ).rejects.toThrow("画像");
    expect(await db.practiceLogs.count()).toBe(0);
  });
  it("preserves one daily record and rolls back duplicate-date images", async () => {
    await save("practiceLogs", practice());
    await expect(
      save("practiceLogs", practice(), [
        new File(["x"], "test.png", { type: "image/png" }),
      ]),
    ).rejects.toThrow();
    expect(await db.practiceLogs.count()).toBe(1);
    expect(await db.attachments.count()).toBe(0);
  });
  it("cleans all references when deleting a goal without deleting learning history", async () => {
    const g = goal();
    await save("goals", g);
    const e = { ...event(), goalIds: [g.id] };
    await save("events", e);
    const l = {
      ...lesson(),
      relatedGoalIds: [g.id],
      relatedEventIds: [e.id],
      plannedTopics: [
        { id: "topic", title: "test", priority: "high" as const, goalId: g.id },
      ],
    };
    await save("lessons", l);
    const p = { ...practice(), goalIds: [g.id] };
    await save("practiceLogs", p);
    const m = {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [g.id],
      objectives: [
        {
          id: "objective",
          title: "test",
          goalId: g.id,
          progress: 0,
          completed: false,
        },
      ],
    };
    await save("monthlyPlans", m);
    const w = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [g.id],
      tasks: [{ id: "task", title: "test", goalIds: [g.id], completed: false }],
    };
    await save("weeklyPlans", w);
    await remove("goals", g.id);
    expect((await db.events.get(e.id))?.goalIds).toEqual([]);
    expect(
      (await db.lessons.get(l.id))?.plannedTopics[0].goalId,
    ).toBeUndefined();
    expect((await db.practiceLogs.get(p.id))?.goalIds).toEqual([]);
    expect(
      (await db.monthlyPlans.get(m.id))?.objectives[0].goalId,
    ).toBeUndefined();
    expect((await db.weeklyPlans.get(w.id))?.tasks[0].goalIds).toEqual([]);
    await remove("events", e.id);
    expect((await db.lessons.get(l.id))?.relatedEventIds).toEqual([]);
  });
  it("lists all upcoming events including overlaps in date order", async () => {
    const dates = [
      "2026-12-05",
      "2026-09-20",
      "2026-10-25",
      "2026-10-25",
      "2026-11-10",
    ];
    for (const date of dates) await save("events", { ...event(), date });
    await save("events", { ...event(), date: "2026-09-19" });
    await save("events", {
      ...event(),
      date: "2026-09-21",
      status: "completed",
    });
    await save("events", {
      ...event(),
      date: "2026-09-22",
      status: "cancelled",
    });
    const result = await home("2026-09-20");
    expect(result.events.map((e) => e.date)).toEqual([...dates].sort());
    expect(result.events.filter((e) => e.date === "2026-10-25")).toHaveLength(
      2,
    );
  });
  it("filters history by month and excludes inactive events from the home view", async () => {
    const e = event();
    await save("events", { ...e, status: "cancelled" });
    await save("events", { ...event(), date: "2026-09-21" });
    await save("practiceLogs", practice());
    await save("practiceLogs", { ...practice(), date: "2026-08-31" });
    const result = await home("2026-09-20");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].date).toBe("2026-09-21");
    expect(result.weekLogs).toHaveLength(1);
    expect(await list("practiceLogs", "2026-09")).toHaveLength(1);
  });
  it("toggles tasks without overwriting other task changes", async () => {
    const w = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [],
      tasks: [
        { id: "a", title: "a", goalIds: [], completed: false },
        { id: "b", title: "b", goalIds: [], completed: false },
      ],
    };
    await save("weeklyPlans", w);
    await Promise.all([
      toggleTask(w.id, "a", true),
      toggleTask(w.id, "b", true),
    ]);
    expect(
      (await db.weeklyPlans.get(w.id))?.tasks.every((t) => t.completed),
    ).toBe(true);
  });
  it("keeps records after closing and reopening the database", async () => {
    const p = practice();
    await save("practiceLogs", p);
    db.close();
    await db.open();
    expect((await db.practiceLogs.get(p.id))?.durationMinutes).toBe(20);
  });
  it("rejects stale lesson references before writing", async () => {
    await expect(
      save("lessons", { ...lesson(), relatedGoalIds: ["missing"] }),
    ).rejects.toThrow("削除");
    expect(await db.lessons.count()).toBe(0);
  });
  it("enforces one plan per period while allowing edits", async () => {
    const m = {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [],
      objectives: [],
      notes: "initial",
    };
    await save("monthlyPlans", m);
    await save("monthlyPlans", { ...m, notes: "updated" });
    expect((await db.monthlyPlans.get(m.id))?.notes).toBe("updated");
    await expect(save("monthlyPlans", { ...m, ...base() })).rejects.toThrow();
    const w = {
      ...base(),
      ...weekOf("2026-09-20"),
      focusGoalIds: [],
      tasks: [],
    };
    await save("weeklyPlans", w);
    await expect(save("weeklyPlans", { ...w, ...base() })).rejects.toThrow();
    expect(await db.monthlyPlans.count()).toBe(1);
    expect(await db.weeklyPlans.count()).toBe(1);
  });
  it("removes selected images and updates the record in one transaction", async () => {
    const p = practice();
    await save("practiceLogs", p, [
      new File(["image"], "a.png", { type: "image/png" }),
    ]);
    const stored = (await db.practiceLogs.get(p.id))!;
    await save(
      "practiceLogs",
      { ...stored, note: "updated" },
      [],
      stored.attachmentIds,
    );
    expect((await db.practiceLogs.get(p.id))?.attachmentIds).toEqual([]);
    expect(await db.attachmentFiles.count()).toBe(0);
    expect((await db.practiceLogs.get(p.id))?.note).toBe("updated");
  });
});
