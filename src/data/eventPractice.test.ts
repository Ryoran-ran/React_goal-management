import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DanceEvent, EventPracticeSession } from "../types";
import { db } from "./db";
import { base, save } from "./repository";
import {
  allEventPracticeTemplates,
  deleteEventPracticeSession,
  eventPracticeBetween,
  saveEventPracticeSession,
  saveEventPracticeTemplate,
  setEventPracticeStatus,
} from "./eventPractice";

const event = (): DanceEvent => ({
  ...base(),
  title: "大会",
  type: "competition",
  date: "2026-10-20",
  status: "planned",
  goalIds: [],
});

const session = (): EventPracticeSession => ({
  ...base(),
  date: "2026-10-12",
  kind: "custom",
  title: " リハーサル ",
  status: "planned",
  memo: " 衣装を着る ",
});

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("event practice persistence", () => {
  it("adds, updates, lists and deletes a session inside its event", async () => {
    const owner = event();
    const item = session();
    await save("events", owner);
    await saveEventPracticeSession(owner.id, item);
    expect(
      (await db.events.get(owner.id))?.practiceSessions?.[0],
    ).toMatchObject({
      title: "リハーサル",
      memo: "衣装を着る",
    });
    expect(await eventPracticeBetween(item.date, item.date)).toHaveLength(1);
    await setEventPracticeStatus(owner.id, item.id, "completed");
    expect((await db.events.get(owner.id))?.practiceSessions?.[0].status).toBe(
      "completed",
    );
    await deleteEventPracticeSession(owner.id, item.id);
    expect((await db.events.get(owner.id))?.practiceSessions).toEqual([]);
  });

  it("stores reusable custom templates", async () => {
    await saveEventPracticeTemplate({
      id: "rehearsal",
      title: " リハーサル ",
      memo: " 衣装を着る ",
    });
    expect(await allEventPracticeTemplates()).toEqual([
      { id: "rehearsal", title: "リハーサル", memo: "衣装を着る" },
    ]);
  });
});
