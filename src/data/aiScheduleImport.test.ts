import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DanceEvent, EventWorkItem } from "../types";
import { parseAiEventSchedule } from "../lib/aiEventSchedule";
import { db } from "./db";
import { base, save } from "./repository";
import { importAiEventSchedule } from "./aiScheduleImport";

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

const response = JSON.stringify({
  eventTitle: "秋の大会",
  milestones: [
    {
      key: "costume",
      title: "衣装決定",
      dueDate: "2026-10-10",
      successCriteria: "衣装を決める",
      workItems: [
        {
          title: "衣装を試着",
          description: "動きやすさを確認する",
          startDate: "2026-10-01",
          dueDate: "2026-10-05",
          priority: "medium",
        },
      ],
    },
  ],
  workItems: [],
});

describe("AI schedule import", () => {
  it("adds milestones and linked work in one event update", async () => {
    const event: DanceEvent = {
      ...base(),
      title: "秋の大会",
      type: "competition",
      date: "2026-10-25",
      status: "planned",
      goalIds: [],
    };
    await save("events", event);
    const stored = (await db.events.get(event.id))!;
    const draft = parseAiEventSchedule(response, stored);
    const result = await importAiEventSchedule(
      stored.id,
      stored.updatedAt,
      draft,
    );
    const imported = (await db.events.get(event.id))!;
    expect(result.milestones).toHaveLength(1);
    expect(imported.milestones?.[0].title).toBe("衣装決定");
    expect(imported.workItems?.[0].milestoneId).toBe(
      imported.milestones?.[0].id,
    );
  });

  it("does not import over a newer event version", async () => {
    const event: DanceEvent = {
      ...base(),
      title: "秋の大会",
      type: "competition",
      date: "2026-10-25",
      status: "planned",
      goalIds: [],
    };
    await save("events", event);
    const stored = (await db.events.get(event.id))!;
    const draft = parseAiEventSchedule(response, stored);
    await db.events.update(event.id, { updatedAt: "2099-01-01T00:00:00.000Z" });
    await expect(
      importAiEventSchedule(stored.id, stored.updatedAt, draft),
    ).rejects.toThrow("別の画面");
  });

  it("changes existing dates and adds only missing items in one update", async () => {
    const existingWork: EventWorkItem = {
      ...base(),
      id: "existing-work",
      title: "衣装を受け取る",
      description: "先生から受け取る",
      priority: "high",
      startDate: "2026-10-01",
      dueDate: "2026-10-03",
      baseline: { startDate: "2026-10-01", dueDate: "2026-10-03" },
      status: "not_started",
      changes: [],
    };
    const event: DanceEvent = {
      ...base(),
      title: "秋の大会",
      type: "competition",
      date: "2026-10-25",
      status: "planned",
      goalIds: [],
      workItems: [existingWork],
    };
    await save("events", event);
    const stored = (await db.events.get(event.id))!;
    const draft = parseAiEventSchedule(
      JSON.stringify({
        eventTitle: stored.title,
        changes: [
          {
            kind: "work",
            id: existingWork.id,
            startDate: "2026-10-05",
            dueDate: "2026-10-07",
            reason: "受取日が変更されたため",
          },
        ],
        milestones: [],
        workItems: [
          {
            title: "衣装で通し練習をする",
            description: "動きにくい箇所を確認する",
            startDate: "2026-10-08",
            dueDate: "2026-10-10",
            priority: "high",
          },
        ],
      }),
      stored,
    );
    const result = await importAiEventSchedule(
      stored.id,
      stored.updatedAt,
      draft,
    );
    const updated = (await db.events.get(event.id))!;
    expect(result.changes).toHaveLength(1);
    expect(updated.workItems).toHaveLength(2);
    expect(updated.workItems?.[0].startDate).toBe("2026-10-05");
    expect(updated.workItems?.[0].baseline).toEqual(existingWork.baseline);
    expect(updated.workItems?.[0].changes[0].reason).toBe(
      "受取日が変更されたため",
    );
    expect(updated.workItems?.[1].title).toBe("衣装で通し練習をする");
  });
});
