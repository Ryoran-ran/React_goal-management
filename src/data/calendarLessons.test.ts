import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { liveQuery } from "dexie";
import { db } from "./db";
import { calendarLessons, type CalendarLessonCounts } from "./calendarLessons";
import {
  createLessonSchedule,
  ensureLessonSchedules,
  newOccurrence,
  saveLessonOccurrence,
  type LessonSchedule,
} from "./lessonSchedule";

const schedule: LessonSchedule = {
  title: "個人レッスン",
  startDate: "2026-09-21",
  endDate: "",
  weekdays: [1],
  excludedDates: [],
};
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("calendar lesson markers", () => {
  it("counts actual and completed lessons separately from cancellations, including mixed days", async () => {
    const moved = {
      ...newOccurrence(schedule, "a", "2026-09-21", "2026-09-22"),
      completed: true,
    };
    await db.lessons.bulkPut([
      moved,
      newOccurrence({ ...schedule, title: "別レッスン" }, "b", "2026-09-22"),
      { ...newOccurrence(schedule, "c", "2026-09-22"), cancelled: true },
      { ...newOccurrence(schedule, "a", "2026-09-23"), cancelled: true },
      newOccurrence(schedule, "a", "2026-10-01"),
    ]);
    expect(await calendarLessons("2026-09-21", "2026-09-23")).toEqual({
      "2026-09-22": { active: 2, cancelled: 1 },
      "2026-09-23": { active: 0, cancelled: 1 },
    });
  });
  it("previews distant recurring lessons without writing from liveQuery", async () => {
    await createLessonSchedule(schedule);
    const before = await db.lessons.count();
    const markers = await new Promise<CalendarLessonCounts>(
      (resolve, reject) => {
        const subscription = liveQuery(() =>
          calendarLessons("2027-01-01", "2027-01-31"),
        ).subscribe({
          next: (value) => {
            subscription.unsubscribe();
            resolve(value);
          },
          error: reject,
        });
      },
    );
    expect(markers).toEqual({
      "2027-01-04": { active: 1, cancelled: 0 },
      "2027-01-11": { active: 1, cancelled: 0 },
      "2027-01-18": { active: 1, cancelled: 0 },
      "2027-01-25": { active: 1, cancelled: 0 },
    });
    expect(await db.lessons.count()).toBe(before);
    await ensureLessonSchedules("2027-01-31");
    expect(await calendarLessons("2027-01-01", "2027-01-31")).toEqual(markers);
  });
  it("matches generated dates after repeated backward weekday shifts, exclusions and a finite end", async () => {
    await createLessonSchedule({
      ...schedule,
      weekdays: [1, 4],
      excludedDates: ["2027-01-11"],
    });
    const first = (await db.lessons.orderBy("date").first())!;
    await saveLessonOccurrence(
      { ...first, date: "2026-09-20" },
      [],
      [],
      "following",
      first,
    );
    const shifted = (await db.lessons.get(first.id))!;
    await saveLessonOccurrence(
      { ...shifted, date: "2026-09-19" },
      [],
      [],
      "following",
      shifted,
    );
    const preview = await calendarLessons("2027-01-01", "2027-01-31");
    expect(preview["2027-01-02"]).toEqual({ active: 1, cancelled: 0 });
    expect(preview["2027-01-09"]).toBeUndefined();
    expect(preview["2027-01-30"]).toEqual({ active: 1, cancelled: 0 });
    await ensureLessonSchedules("2027-01-31");
    expect(await calendarLessons("2027-01-01", "2027-01-31")).toEqual(preview);
    await createLessonSchedule({
      ...schedule,
      title: "期間限定",
      endDate: "2026-10-05",
    });
    expect(await calendarLessons("2027-01-01", "2027-01-31")).toEqual(preview);
  });
  it("keeps a cancelled occurrence visible without recreating it and supports restoring it", async () => {
    await createLessonSchedule(schedule);
    const first = (await db.lessons.orderBy("date").first())!;
    await saveLessonOccurrence(
      { ...first, cancelled: true, cancellationReason: "先生の都合" },
      [],
      [],
      "one",
      first,
    );
    await ensureLessonSchedules("2027-01-31");
    expect(await calendarLessons(first.date, first.date)).toEqual({
      [first.date]: { active: 0, cancelled: 1 },
    });
    expect(await db.lessons.where("date").equals(first.date).count()).toBe(1);
    const cancelled = (await db.lessons.get(first.id))!;
    await saveLessonOccurrence(
      { ...cancelled, cancelled: false },
      [],
      [],
      "one",
      cancelled,
    );
    expect(await calendarLessons(first.date, first.date)).toEqual({
      [first.date]: { active: 1, cancelled: 0 },
    });
  });
});
