import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, save, remove } from "./repository";
import type { DanceEvent, EventMilestone } from "../types";
import {
  deleteEventMilestone,
  milestoneDeadlines,
  saveEventDetails,
  saveEventMilestone,
  setMilestoneTaskCompleted,
} from "./eventMilestones";
import { createBackup, readBackup, restoreBackup } from "./backup";
import { validateBackupRows } from "./backupValidation";

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());
const event = (): DanceEvent => ({
  ...base(),
  title: "大会",
  date: "2026-10-25",
  type: "competition",
  status: "planned",
  goalIds: [],
});
const item = (): EventMilestone => ({
  ...base(),
  title: "振り付けを覚える",
  successCriteria: "最後まで通せる",
  status: "not_started",
  startDate: "2026-09-01",
  dueDate: "2026-09-20",
  changes: [],
});
const get = async (id: string) => (await db.events.get(id))!;

describe("event milestones", () => {
  it("adds independent milestones to existing events and preserves the baseline after changes", async () => {
    const source = event();
    await save("events", source);
    await saveEventMilestone(source.id, item());
    const saved = (await get(source.id)).milestones![0];
    await saveEventMilestone(
      source.id,
      { ...saved, dueDate: "2026-09-27" },
      "覚える範囲を変更",
    );
    const revised = (await get(source.id)).milestones![0];
    expect(revised.baseline?.dueDate).toBe("2026-09-20");
    expect(revised.changes[0].reason).toBe("覚える範囲を変更");
    expect((await get(source.id)).date).toBe(source.date);
    expect((await get(source.id)).status).toBe("planned");
    await expect(
      saveEventMilestone(source.id, {
        ...saved,
        updatedAt: "2000-01-01T00:00:00Z",
      }),
    ).rejects.toThrow("別の画面");
  });
  it("updates event dates with opt-in shifts and prevents stale event edits overwriting milestones", async () => {
    const source = event();
    await save("events", source);
    await saveEventMilestone(source.id, item());
    let latest = await get(source.id);
    await saveEventDetails({ ...latest, date: "2026-11-01" }, [], [], false);
    latest = await get(source.id);
    expect(latest.milestones![0].dueDate).toBe("2026-09-20");
    await saveEventDetails({ ...latest, date: "2026-11-08" }, [], [], true);
    latest = await get(source.id);
    expect(latest.milestones![0].dueDate).toBe("2026-09-27");
    expect(latest.milestones![0].baseline?.dueDate).toBe("2026-09-20");
    await expect(
      saveEventDetails(
        { ...source, updatedAt: "2000-01-01T00:00:00Z" },
        [],
        [],
        false,
      ),
    ).rejects.toThrow("別の画面");
  });
  it("round-trips milestones, original dates and histories through the backup", async () => {
    const source = event();
    await save("events", source);
    await saveEventMilestone(source.id, item());
    const first = (await get(source.id)).milestones![0];
    await saveEventMilestone(
      source.id,
      {
        ...first,
        dueDate: "2026-09-24",
        status: "achieved",
        completedDate: "2026-09-23",
        tasks: [
          { id: "first-half", title: "前半を覚える", completed: true },
          { id: "second-half", title: "後半を覚える", completed: false },
        ],
      },
      "調整",
    );
    const expected = await get(source.id);
    const backup = await readBackup(await createBackup());
    const invalid = structuredClone(backup.tables);
    (invalid.events[0].milestones as EventMilestone[])[0].dueDate = "broken";
    expect(() => validateBackupRows(invalid)).toThrow();
    const invalidTasks = structuredClone(backup.tables);
    (invalidTasks.events[0].milestones as EventMilestone[])[0].tasks![0].title =
      " ";
    expect(() => validateBackupRows(invalidTasks)).toThrow();
    await db.events.clear();
    await restoreBackup(backup);
    expect(await get(source.id)).toEqual(expected);
  });
  it("shows unfinished deadlines only for active events and removes only the requested milestone", async () => {
    const source = event();
    await save("events", source);
    const unfinished = item();
    await saveEventMilestone(source.id, unfinished);
    await saveEventMilestone(source.id, {
      ...item(),
      status: "achieved",
      completedDate: "2026-09-19",
    });
    await saveEventMilestone(source.id, { ...item(), status: "skipped" });
    const deadlines = await milestoneDeadlines("2026-09-20", "2026-09-20");
    expect(deadlines.map((x) => x.milestone.id)).toEqual([unfinished.id]);
    await saveEventDetails(
      { ...(await get(source.id)), status: "completed" },
      [],
      [],
      false,
    );
    expect(await milestoneDeadlines("2026-09-01", "2026-09-30")).toEqual([]);
    await deleteEventMilestone(source.id, unfinished.id);
    expect((await get(source.id)).milestones).toHaveLength(2);
    await expect(
      saveEventMilestone(source.id, unfinished, "", true),
    ).rejects.toThrow("削除されています");
    await remove("events", source.id);
    await expect(saveEventMilestone(source.id, unfinished)).rejects.toThrow(
      "見つかりません",
    );
  });
  it("rejects invalid plans atomically without modifying the event", async () => {
    const source = event();
    await save("events", source);
    const before = await get(source.id);
    await expect(
      saveEventMilestone(source.id, { ...item(), startDate: "2026-10-01" }),
    ).rejects.toThrow();
    expect(await get(source.id)).toEqual(before);
  });
  it("adds, edits and removes multiple tasks without changing sibling milestones", async () => {
    const source = event();
    await save("events", source);
    const first = item();
    const sibling = { ...item(), title: "音楽に合わせて通す" };
    await saveEventMilestone(source.id, sibling);
    await saveEventMilestone(source.id, {
      ...first,
      tasks: [
        { id: "a", title: " 前半を覚える ", completed: false },
        { id: "b", title: "後半を覚える", completed: false },
      ],
    });
    const saved = (await get(source.id)).milestones!.find(
      (value) => value.id === first.id,
    )!;
    expect(saved.tasks?.map((task) => task.title)).toEqual([
      "前半を覚える",
      "後半を覚える",
    ]);
    await saveEventMilestone(
      source.id,
      {
        ...saved,
        tasks: [
          {
            ...saved.tasks![1],
            title: "後半を見本なしで踊る",
            completed: true,
          },
        ],
      },
      "",
      true,
    );
    const latest = (await get(source.id)).milestones!;
    expect(latest.find((value) => value.id === first.id)?.tasks).toEqual([
      { id: "b", title: "後半を見本なしで踊る", completed: true },
    ]);
    expect(latest.find((value) => value.id === sibling.id)?.title).toBe(
      sibling.title,
    );
    expect(latest.find((value) => value.id === first.id)?.changes).toEqual([]);
    const before = await get(source.id);
    const latestItem = latest.find((value) => value.id === first.id)!;
    await expect(
      saveEventMilestone(source.id, {
        ...latestItem,
        tasks: [{ id: "empty", title: " ", completed: false }],
      }),
    ).rejects.toThrow("作業名");
    expect(await get(source.id)).toEqual(before);
  });
  it("updates concurrent task checks without completing the milestone and rejects stale editor saves", async () => {
    const source = event();
    await save("events", source);
    await saveEventMilestone(source.id, {
      ...item(),
      tasks: [
        { id: "a", title: "前半", completed: false },
        { id: "b", title: "後半", completed: false },
      ],
    });
    const stale = (await get(source.id)).milestones![0];
    await Promise.all([
      setMilestoneTaskCompleted(source.id, stale.id, "a", true),
      setMilestoneTaskCompleted(source.id, stale.id, "b", true),
    ]);
    let latest = (await get(source.id)).milestones![0];
    expect(latest.tasks?.every((task) => task.completed)).toBe(true);
    expect(latest.status).toBe("not_started");
    expect(latest.completedDate).toBeUndefined();
    expect(latest.baseline).toEqual(stale.baseline);
    expect(latest.changes).toEqual(stale.changes);
    expect(latest.updatedAt > stale.updatedAt).toBe(true);
    await expect(
      saveEventMilestone(source.id, stale, "", true),
    ).rejects.toThrow("別の画面");
    await setMilestoneTaskCompleted(source.id, stale.id, "a", false);
    latest = (await get(source.id)).milestones![0];
    expect(latest.tasks?.map((task) => task.completed)).toEqual([false, true]);
  });
  it("does not recreate deleted tasks, milestones or events when checking a stale list", async () => {
    const source = event();
    await save("events", source);
    await saveEventMilestone(source.id, {
      ...item(),
      tasks: [{ id: "a", title: "前半", completed: false }],
    });
    const saved = (await get(source.id)).milestones![0];
    await saveEventMilestone(source.id, { ...saved, tasks: [] }, "", true);
    await expect(
      setMilestoneTaskCompleted(source.id, saved.id, "a", true),
    ).rejects.toThrow("削除されています");
    expect((await get(source.id)).milestones![0].tasks).toEqual([]);
    await deleteEventMilestone(source.id, saved.id);
    await expect(
      setMilestoneTaskCompleted(source.id, saved.id, "a", true),
    ).rejects.toThrow("削除されています");
    expect((await get(source.id)).milestones).toEqual([]);
    await remove("events", source.id);
    await expect(
      setMilestoneTaskCompleted(source.id, saved.id, "a", true),
    ).rejects.toThrow("見つかりません");
    expect(await db.events.get(source.id)).toBeUndefined();
  });
});
