import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, home, save } from "./repository";
import { agendaBetween, agendaStatus, practiceAgenda } from "./practiceAgenda";
import { openAgendaItem } from "../lib/practiceNavigation";
import type { Lesson, PracticeLog } from "../types";

const practice = (date: string): PracticeLog => ({
  ...base(),
  date,
  title: "自主練習",
  status: "planned",
  practiced: false,
  durationMinutes: 30,
  goalIds: [],
  attachmentIds: [],
});
const lesson = (date: string): Lesson => ({
  ...base(),
  date,
  title: "個人レッスン",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  completed: false,
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

describe("combined practice and lesson agenda", () => {
  it("shows only the selected day, keeping multiple lessons, practice and every status", async () => {
    await save("practiceLogs", practice("2026-09-30"));
    await save("lessons", lesson("2026-09-30"));
    await save("lessons", { ...lesson("2026-09-30"), completed: true });
    await save("lessons", { ...lesson("2026-09-30"), cancelled: true });
    await save("lessons", lesson("2026-09-29"));
    await save("lessons", lesson("2026-10-01"));
    const daily = await practiceAgenda("2026-09-30");
    expect(daily).toHaveLength(4);
    expect(daily.every((item) => item.record.date === "2026-09-30")).toBe(true);
    expect(daily.filter((item) => item.kind === "lesson")).toHaveLength(3);
    expect(
      daily.filter((item) => agendaStatus(item) === "cancelled"),
    ).toHaveLength(1);
    expect(
      daily.filter((item) => agendaStatus(item) === "recorded"),
    ).toHaveLength(1);
    expect(
      daily.filter((item) => agendaStatus(item) === "planned"),
    ).toHaveLength(2);
    expect(await practiceAgenda("2026-10-01")).toHaveLength(1);
    expect(await practiceAgenda("2026-10-02")).toEqual([]);
    expect(await practiceAgenda("2026-09")).toHaveLength(5);
  });

  it("queries the exact day across year and leap-day boundaries", async () => {
    const dates = [
      "2026-12-31",
      "2027-01-01",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ];
    for (const date of dates) await save("lessons", lesson(date));
    for (const date of dates) {
      expect(
        (await practiceAgenda(date)).map((item) => item.record.date),
      ).toEqual([date]);
    }
    expect(await practiceAgenda("2028-02")).toHaveLength(2);
  });

  it("shows today's and upcoming items across month boundaries, excluding cancellations", async () => {
    await save("practiceLogs", practice("2026-09-30"));
    await save("lessons", lesson("2026-09-30"));
    await save("lessons", lesson("2026-10-01"));
    await save("lessons", lesson("2026-10-07"));
    await save("lessons", lesson("2026-10-08"));
    await save("lessons", { ...lesson("2026-10-02"), cancelled: true });
    await save("practiceLogs", {
      ...practice("2026-10-03"),
      status: "cancelled",
    });
    await save("lessons", lesson("2026-09-29"));
    const items = await agendaBetween("2026-09-30", "2026-10-07");
    expect(items.map((item) => item.record.date)).toEqual([
      "2026-09-30",
      "2026-09-30",
      "2026-10-01",
      "2026-10-07",
    ]);
  });
  it("opens a due plan for recording without changing the stored record until save", async () => {
    const log = practice("2026-09-20");
    const scheduled = lesson("2026-09-19");
    await save("practiceLogs", log);
    await save("lessons", scheduled);
    for (const item of await practiceAgenda("2026-09")) {
      const entry = openAgendaItem(item, "2026-09-20");
      expect(entry.type === "edit" && entry.recording).toBe(true);
      expect(entry.type === "edit" && entry.item.record.id).toBe(
        item.record.id,
      );
    }
    expect((await db.practiceLogs.get(log.id))?.status).toBe("planned");
    expect((await db.lessons.get(scheduled.id))?.completed).toBe(false);
    for (const item of [
      { kind: "practice" as const, record: practice("2026-09-21") },
      {
        kind: "practice" as const,
        record: { ...log, status: "recorded" as const },
      },
      {
        kind: "practice" as const,
        record: { ...log, status: "cancelled" as const },
      },
      { kind: "lesson" as const, record: { ...scheduled, completed: true } },
      { kind: "lesson" as const, record: { ...scheduled, cancelled: true } },
    ]) {
      const entry = openAgendaItem(item, "2026-09-20");
      expect(entry.type === "edit" && entry.recording).toBe(false);
    }
  });
  it("lists both sources in chronological order and keeps same-day entries distinct", async () => {
    const log = practice("2026-09-22");
    const scheduled = lesson("2026-09-22");
    await save("practiceLogs", log);
    await save("lessons", scheduled);
    await save("lessons", lesson("2026-09-21"));
    await save("lessons", lesson("2026-10-01"));
    const items = await practiceAgenda("2026-09");
    expect(items.map((item) => item.record.date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-22",
    ]);
    expect(items.find((item) => item.kind === "practice")?.record.id).toBe(
      log.id,
    );
    expect(items.find((item) => item.record.id === scheduled.id)?.kind).toBe(
      "lesson",
    );
  });
  it("treats old daily logs as recorded, and distinguishes lesson cancellations", async () => {
    await save("practiceLogs", {
      ...practice("2026-09-20"),
      practiced: true,
      status: undefined,
    });
    await save("lessons", { ...lesson("2026-09-20"), cancelled: true });
    await save("lessons", { ...lesson("2026-09-21"), completed: true });
    const items = await practiceAgenda("2026-09");
    expect(
      items.filter((item) => agendaStatus(item) === "recorded"),
    ).toHaveLength(2);
    expect(
      items.filter((item) => agendaStatus(item) === "cancelled"),
    ).toHaveLength(1);
  });
  it("does not count planned or cancelled practice as recorded days", async () => {
    const planned = practice("2026-09-20");
    await save("practiceLogs", planned);
    await save("practiceLogs", {
      ...practice("2026-09-19"),
      status: "cancelled",
    });
    const overview = await home("2026-09-20");
    expect(overview.todayLog).toBeUndefined();
    expect(overview.weekLogs).toEqual([]);
    await save("practiceLogs", {
      ...planned,
      status: "recorded",
      practiced: true,
      whatWentWell: "重心を保てた",
    });
    const updated = await home("2026-09-20");
    expect(updated.todayLog?.id).toBe(planned.id);
    expect(updated.weekLogs).toHaveLength(1);
    expect(await db.practiceLogs.count()).toBe(2);
  });
  it("retains the same practice record and attachments when rescheduling and recording", async () => {
    const planned = { ...practice("2026-09-20"), plannedNote: "ルンバを10分" };
    await save("practiceLogs", planned, [
      new File(["x"], "practice.png", { type: "image/png" }),
    ]);
    const stored = (await db.practiceLogs.get(planned.id))!;
    await save("practiceLogs", {
      ...stored,
      date: "2026-09-23",
      status: "recorded",
      practiced: true,
      durationMinutes: 40,
    });
    const item = (await practiceAgenda("2026-09"))[0];
    expect(item.kind).toBe("practice");
    expect(item.record.id).toBe(planned.id);
    expect(item.record.date).toBe("2026-09-23");
    expect(item.record.attachmentIds).toEqual(stored.attachmentIds);
    expect(agendaStatus(item)).toBe("recorded");
  });
  it("edits the original lesson without creating a second practice log", async () => {
    const planned = lesson("2026-09-20");
    await save("lessons", planned);
    await save("lessons", {
      ...planned,
      completed: true,
      homework: "次回の宿題",
    });
    const [item] = await practiceAgenda("2026-09");
    expect(agendaStatus(item)).toBe("recorded");
    expect(item.kind === "lesson" && item.record.homework).toBe("次回の宿題");
    expect(await db.practiceLogs.count()).toBe(0);
  });
});
