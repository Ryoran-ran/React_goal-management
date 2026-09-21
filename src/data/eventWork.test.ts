import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, initialize, save } from "./repository";
import { saveEventWork, deleteEventWork } from "./eventWork";
import {
  deleteEventMilestone,
  saveEventDetails,
  saveEventMilestone,
} from "./eventMilestones";
import { createBackup, readBackup, restoreBackup } from "./backup";
import {
  normalizeEventWork,
  validateEventWork,
  workSchedule,
  withWorkStatus,
} from "../lib/eventWork";
import { ganttRange, milestoneTiming } from "../lib/milestones";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";

beforeEach(async () => {
  for (const table of db.tables) await table.clear();
});
afterAll(() => db.delete());
const milestone = (): EventMilestone => ({
  ...base(),
  title: "振り付けを覚える",
  successCriteria: "順番を再現できる",
  status: "not_started",
  dueDate: "2026-10-10",
  changes: [],
});
const event = (): DanceEvent => ({
  ...base(),
  title: "大会",
  type: "competition",
  status: "planned",
  date: "2026-10-25",
  goalIds: [],
  milestones: [milestone(), milestone()],
});
const work = (milestoneId?: string): EventWorkItem => ({
  ...base(),
  milestoneId,
  title: "前半を練習する",
  description: "見本を確認",
  status: "not_started",
  priority: "medium",
  startDate: "2026-09-25",
  dueDate: "2026-10-01",
  changes: [],
});
const get = async (id: string) => (await db.events.get(id))!;

describe("independent event work", () => {
  it("uses the start as the omitted end date and records the effective plan", async () => {
    const source = event();
    await save("events", source);
    const draft = { ...work(source.milestones![0].id), dueDate: undefined };
    await saveEventWork(source.id, draft);
    let saved = (await get(source.id)).workItems![0];
    expect(saved.dueDate).toBe(draft.startDate);
    expect(saved.baseline).toEqual({
      startDate: draft.startDate,
      dueDate: draft.startDate,
    });
    await saveEventWork(
      source.id,
      { ...saved, startDate: "2026-09-28", dueDate: undefined },
      "一日練習を移動",
      true,
    );
    saved = (await get(source.id)).workItems![0];
    expect(saved.dueDate).toBe("2026-09-28");
    expect(saved.baseline?.dueDate).toBe("2026-09-25");
    expect(saved.changes[0].to).toEqual({
      startDate: "2026-09-28",
      dueDate: "2026-09-28",
    });
    expect(draft.dueDate).toBeUndefined();
    expect(workSchedule(draft).dueDate).toBe(draft.startDate);
  });
  it("keeps dates absent when both are blank and preserves an explicit end", async () => {
    const source = event();
    await save("events", source);
    await saveEventWork(source.id, {
      ...work(),
      startDate: undefined,
      dueDate: undefined,
    });
    await saveEventWork(source.id, work());
    const saved = (await get(source.id)).workItems!;
    expect(saved[0].dueDate).toBeUndefined();
    expect(saved[0].baseline).toBeUndefined();
    expect(saved[1].dueDate).toBe("2026-10-01");
  });
  it("saves quick status transitions without changing the plan or other items", async () => {
    const source = event();
    await save("events", source);
    await saveEventWork(source.id, work(source.milestones![0].id));
    const initial = (await get(source.id)).workItems![0];
    await saveEventWork(
      source.id,
      withWorkStatus(initial, "in_progress", "2026-09-19"),
      "",
      true,
    );
    let saved = (await get(source.id)).workItems![0];
    expect(saved.actualStartDate).toBe("2026-09-19");
    await saveEventWork(
      source.id,
      withWorkStatus(saved, "completed", "2026-09-20"),
      "",
      true,
    );
    saved = (await get(source.id)).workItems![0];
    expect(saved.completedDate).toBe("2026-09-20");
    expect(saved.actualStartDate).toBe("2026-09-19");
    expect(saved.baseline).toEqual(initial.baseline);
    expect(saved.changes).toEqual(initial.changes);
    expect((await get(source.id)).milestones).toEqual(source.milestones);
    await expect(
      saveEventWork(source.id, withWorkStatus(initial, "completed"), "", true),
    ).rejects.toThrow("別の画面");
    await saveEventWork(
      source.id,
      withWorkStatus(saved, "in_progress", "2026-09-21"),
      "",
      true,
    );
    saved = (await get(source.id)).workItems![0];
    expect(saved.completedDate).toBeUndefined();
    expect(saved.actualStartDate).toBe("2026-09-19");
    await saveEventWork(
      source.id,
      withWorkStatus(saved, "not_started"),
      "",
      true,
    );
    saved = (await get(source.id)).workItems![0];
    expect(saved.actualStartDate).toBeUndefined();
    expect(saved.completedDate).toBeUndefined();
  });
  it("saves separate work schedules and supports reassignment and unassigned work", async () => {
    const source = event();
    await save("events", source);
    const first = work(source.milestones![0].id),
      second = work();
    await Promise.all([
      saveEventWork(source.id, first),
      saveEventWork(source.id, second),
    ]);
    let latest = await get(source.id);
    expect(latest.workItems).toHaveLength(2);
    expect(latest.milestones).toEqual(source.milestones);
    const initial = latest.workItems!.find((item) => item.id === first.id)!;
    await saveEventWork(
      source.id,
      {
        ...initial,
        milestoneId: source.milestones![1].id,
        dueDate: "2026-10-05",
      },
      "練習範囲変更",
      true,
    );
    latest = await get(source.id);
    const revised = latest.workItems!.find((item) => item.id === first.id)!;
    expect(revised.milestoneId).toBe(source.milestones![1].id);
    expect(revised.baseline?.dueDate).toBe("2026-10-01");
    expect(revised.changes[0].reason).toBe("練習範囲変更");
    await expect(saveEventWork(source.id, initial, "", true)).rejects.toThrow(
      "別の画面",
    );
    await saveEventMilestone(
      source.id,
      { ...latest.milestones![0], title: "別の到達点" },
      "",
      true,
    );
    expect((await get(source.id)).workItems).toEqual(latest.workItems);
  });
  it("leaves work intact and unassigned when its milestone is deleted", async () => {
    const source = event();
    await save("events", source);
    await saveEventWork(source.id, work(source.milestones![0].id));
    const before = (await get(source.id)).workItems![0];
    await deleteEventMilestone(source.id, source.milestones![0].id);
    const after = (await get(source.id)).workItems![0];
    expect(after).toMatchObject({
      id: before.id,
      title: before.title,
      startDate: before.startDate,
      dueDate: before.dueDate,
      baseline: before.baseline,
    });
    expect(after.milestoneId).toBeUndefined();
    await expect(saveEventWork(source.id, before, "", true)).rejects.toThrow();
    await deleteEventWork(source.id, before.id);
    await expect(saveEventWork(source.id, after, "", true)).rejects.toThrow(
      "削除されています",
    );
    expect((await get(source.id)).milestones).toHaveLength(1);
  });
  it("does not auto-complete milestones when work finishes and keeps unknown actual dates unknown", async () => {
    const source = event();
    await save("events", source);
    await saveEventWork(source.id, {
      ...work(source.milestones![0].id),
      status: "completed",
    });
    const latest = await get(source.id);
    expect(latest.milestones![0].status).toBe("not_started");
    expect(latest.workItems![0].completedDate).toBeUndefined();
    expect(milestoneTiming(workSchedule(latest.workItems![0]))).toBe(
      "完了日未記録",
    );
  });
  it("shifts unfinished work on request but preserves its original plan and completed work", async () => {
    const source = event();
    await save("events", source);
    await saveEventWork(source.id, work(source.milestones![0].id));
    await saveEventWork(source.id, {
      ...work(),
      status: "completed",
      completedDate: "2026-09-30",
    });
    let latest = await get(source.id);
    const completed = latest.workItems![1];
    await saveEventDetails({ ...latest, date: "2026-11-01" }, [], [], false);
    latest = await get(source.id);
    expect(latest.workItems![0].dueDate).toBe("2026-10-01");
    await saveEventDetails({ ...latest, date: "2026-11-08" }, [], [], true);
    latest = await get(source.id);
    expect(latest.workItems![0].dueDate).toBe("2026-10-08");
    expect(latest.workItems![0].baseline?.dueDate).toBe("2026-10-01");
    expect(latest.workItems![1]).toEqual(completed);
  });
  it("migrates old checklists once on startup, preserving completion without inventing dates", async () => {
    const source = event();
    source.milestones![0].tasks = [
      { id: "a", title: "前半", completed: true },
      { id: "b", title: "後半", completed: false },
    ];
    source.milestones![1].tasks = [
      { id: "a", title: "共通IDの別作業", completed: false },
    ];
    await save("events", source);
    await initialize();
    const first = await get(source.id);
    expect(first.workItems).toHaveLength(3);
    expect(new Set(first.workItems!.map((item) => item.id)).size).toBe(3);
    expect(first.workItems![0]).toMatchObject({
      title: "前半",
      status: "completed",
      milestoneId: source.milestones![0].id,
    });
    expect(first.workItems![0].startDate).toBeUndefined();
    expect(first.workItems![0].completedDate).toBeUndefined();
    expect(first.milestones?.every((item) => item.tasks === undefined)).toBe(
      true,
    );
    expect(() => validateEventWork(first)).not.toThrow();
    await initialize();
    expect(await get(source.id)).toEqual(first);
    expect(normalizeEventWork(first)).toEqual(first);
  });
  it("round-trips independent work and migrates legacy checklists on import", async () => {
    const source = event();
    source.milestones![0].tasks = [
      { id: "a", title: "以前の作業", completed: true },
    ];
    await save("events", source);
    await restoreBackup(await readBackup(await createBackup()));
    const migrated = await get(source.id);
    expect(migrated.workItems).toHaveLength(1);
    await saveEventWork(source.id, work(source.milestones![0].id));
    const expected = await get(source.id);
    const backup = await readBackup(await createBackup());
    await db.events.clear();
    await restoreBackup(backup);
    expect(await get(source.id)).toEqual(expected);
    const invalid = structuredClone(backup);
    (invalid.tables.events[0].workItems as EventWorkItem[])[0].milestoneId =
      "missing";
    await expect(restoreBackup(invalid)).rejects.toThrow();
    expect(await get(source.id)).toEqual(expected);
  });
  it("rejects invalid work without modifying the saved event", async () => {
    const source = event();
    await save("events", source);
    const before = await get(source.id);
    for (const changes of [
      { title: " " },
      { milestoneId: "missing" },
      { startDate: "2027-01-01" },
      { dueDate: "2026-02-30" },
      {
        status: "completed" as const,
        actualStartDate: "2026-10-01",
        completedDate: "2026-09-30",
      },
    ]) {
      await expect(
        saveEventWork(source.id, { ...work(), ...changes }),
      ).rejects.toThrow();
      expect(await get(source.id)).toEqual(before);
    }
    const existing = work();
    expect(() =>
      validateEventWork({ ...source, workItems: [existing, existing] }),
    ).toThrow();
    expect(() =>
      validateEventWork({
        ...source,
        workItems: [{ ...existing, status: "bad" as EventWorkItem["status"] }],
      }),
    ).toThrow();
  });
  it("includes work dates and actuals in the full Gantt range", () => {
    const source = event();
    source.workItems = [
      {
        ...work(),
        startDate: "2026-08-01",
        status: "completed",
        completedDate: "2026-11-10",
      },
    ];
    expect(ganttRange(source, "event", "2026-09-21")).toEqual({
      start: "2026-08-01",
      end: "2026-11-10",
    });
  });
});
