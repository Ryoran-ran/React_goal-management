import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db, DanceDatabase } from "./db";
import {
  createLessonSchedule,
  ensureLessonSchedules,
  followingLessonDates,
  previewLessonSchedule,
  saveLessonOccurrence,
  type LessonSchedule,
} from "./lessonSchedule";
import { base, home, list, previousLesson, remove, save } from "./repository";
import { practiceAgenda } from "./practiceAgenda";
import { weeklyDates } from "../lib/recurrence";

const schedule = (): LessonSchedule & { endDate: string } => ({
  title: "個人レッスン",
  startDate: "2026-09-21",
  endDate: "2026-11-02",
  weekdays: [1],
  excludedDates: [],
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(async () => {
  await db.delete();
});

describe("weekly lesson schedules", () => {
  it("accepts an empty end date and extends the persisted schedule when a future month is opened", async () => {
    const created = await createLessonSchedule({ ...schedule(), endDate: "" });
    expect(created.created).toBe(8);
    const first = (await db.lessons.orderBy("date").first())!;
    db.close();
    await db.open();
    await ensureLessonSchedules("2027-01-31");
    const january = await practiceAgenda("2027-01");
    expect(january.map((item) => item.record.date)).toEqual([
      "2027-01-04",
      "2027-01-11",
      "2027-01-18",
      "2027-01-25",
    ]);
    expect(
      january.every(
        (item) =>
          item.kind === "lesson" && item.record.seriesId === first.seriesId,
      ),
    ).toBe(true);
    const count = await db.lessons.count();
    await Promise.all([
      ensureLessonSchedules("2027-01-31"),
      ensureLessonSchedules("2027-01-31"),
    ]);
    expect(await db.lessons.count()).toBe(count);
  });
  it("does not recreate excluded, moved, cancelled or deleted occurrences when extending", async () => {
    await createLessonSchedule({
      ...schedule(),
      endDate: undefined,
      excludedDates: ["2026-09-28"],
    });
    const [first, second, third] = await db.lessons.orderBy("date").toArray();
    await saveLessonOccurrence(
      { ...first, date: "2026-09-22" },
      [],
      [],
      "one",
      first,
    );
    await save("lessons", { ...second, cancelled: true });
    await remove("lessons", third.id);
    await ensureLessonSchedules("2027-03-31");
    expect(await db.lessons.where("date").equals("2026-09-28").count()).toBe(0);
    expect(await db.lessons.where("date").equals(first.date).count()).toBe(0);
    expect((await db.lessons.get(second.id))?.cancelled).toBe(true);
    expect(
      await db.lessons
        .where("originalDate")
        .equals(third.originalDate!)
        .count(),
    ).toBe(0);
  });
  it("extends home schedules while keeping an explicit end date finite", async () => {
    await createLessonSchedule(schedule());
    await ensureLessonSchedules("2027-04-01");
    expect(await db.lessons.count()).toBe(7);
    await createLessonSchedule({
      ...schedule(),
      title: "継続レッスン",
      endDate: "",
    });
    await ensureLessonSchedules("2027-05-26");
    expect((await home("2027-04-01")).nextLesson?.date).toBe("2027-04-05");
  });
  it("carries bulk weekday changes into occurrences generated later, including repeated backward shifts", async () => {
    await createLessonSchedule({
      ...schedule(),
      endDate: "",
      weekdays: [1, 4],
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
    await ensureLessonSchedules("2027-01-31");
    const january = await list("lessons", "2027-01");
    expect(
      january.some(
        (lesson) =>
          lesson.date === "2027-01-30" && lesson.originalDate === "2027-02-01",
      ),
    ).toBe(true);
    expect(
      january.some(
        (lesson) =>
          lesson.date === "2027-01-07" && lesson.originalDate === "2027-01-07",
      ),
    ).toBe(true);
    expect(
      january.every((lesson) =>
        [4, 6].includes(new Date(`${lesson.date}T12:00:00`).getDay()),
      ),
    ).toBe(true);
  });
  it("supports multiple weekdays, inclusive bounds and year transitions", () => {
    expect(
      weeklyDates({
        startDate: "2026-12-28",
        endDate: "2027-01-04",
        weekdays: [1, 4],
      }),
    ).toEqual(["2026-12-28", "2026-12-31", "2027-01-04"]);
    expect(
      weeklyDates({
        startDate: "2026-09-20",
        endDate: "2026-09-20",
        weekdays: [0],
      }),
    ).toEqual(["2026-09-20"]);
  });
  it("rejects missing weekdays, invalid ranges and unbounded generation", () => {
    expect(() => weeklyDates({ ...schedule(), weekdays: [] })).toThrow("曜日");
    expect(() => weeklyDates({ ...schedule(), endDate: "2026-09-01" })).toThrow(
      "終了日",
    );
    expect(() =>
      weeklyDates({ ...schedule(), startDate: "2026-02-30" }),
    ).toThrow("開始日");
    expect(() => weeklyDates({ ...schedule(), endDate: "2030-01-01" })).toThrow(
      "366日",
    );
  });
  it("creates only selected occurrences and shares a series ID", async () => {
    const result = await createLessonSchedule({
      ...schedule(),
      excludedDates: ["2026-09-28"],
    });
    expect(result.created).toBe(6);
    const lessons = await db.lessons.toArray();
    expect(new Set(lessons.map((l) => l.seriesId)).size).toBe(1);
    expect(
      lessons.every(
        (l) => l.date === l.originalDate && !l.completed && !l.cancelled,
      ),
    ).toBe(true);
    expect(lessons.some((l) => l.date === "2026-09-28")).toBe(false);
    expect(
      lessons.every(
        (lesson) =>
          lesson.relatedEventIds.length === 0 &&
          lesson.relatedGoalIds.length === 0,
      ),
    ).toBe(true);
  });
  it("skips existing, rescheduled and cancelled occurrences on repeated creation", async () => {
    await createLessonSchedule(schedule());
    const lessons = await db.lessons.orderBy("date").toArray();
    await saveLessonOccurrence(
      { ...lessons[0], date: "2026-09-22" },
      [],
      [],
      "one",
      lessons[0],
    );
    await save("lessons", { ...lessons[1], cancelled: true });
    expect(
      (await previewLessonSchedule(schedule())).every((day) => day.duplicate),
    ).toBe(true);
    await expect(createLessonSchedule(schedule())).rejects.toThrow(
      "登録する日がありません",
    );
    expect(await db.lessons.count()).toBe(7);
    await createLessonSchedule({ ...schedule(), endDate: "2026-11-09" });
    expect(await db.lessons.count()).toBe(8);
  });
  it("rolls back the entire batch if the duration is invalid", async () => {
    await expect(
      createLessonSchedule({ ...schedule(), durationMinutes: -1 }),
    ).rejects.toThrow();
    expect(await db.lessons.count()).toBe(0);
  });
  it("assigns events when recording each occurrence and keeps goals on the event", async () => {
    const goal = {
      ...base(),
      title: "姿勢を保つ",
      status: "not_started" as const,
      priority: "medium" as const,
      progress: 0,
      eventIds: [],
    };
    await save("goals", goal);
    const competition = {
      ...base(),
      title: "秋の大会",
      date: "2026-11-15",
      type: "competition" as const,
      status: "planned" as const,
      goalIds: [goal.id],
    };
    const medal = {
      ...base(),
      title: "メダルテスト",
      date: "2026-12-01",
      type: "medal_test" as const,
      status: "planned" as const,
      goalIds: [],
    };
    await save("events", competition);
    await save("events", medal);
    // A stale caller cannot attach a purpose to the whole recurring series.
    const oldSchedule = {
      ...schedule(),
      relatedGoalIds: [goal.id],
      relatedEventIds: [competition.id],
    };
    await createLessonSchedule(oldSchedule);
    const [first, second, third] = await db.lessons.orderBy("date").toArray();
    expect(first.relatedEventIds).toEqual([]);
    expect(first.relatedGoalIds).toEqual([]);
    await saveLessonOccurrence(
      { ...first, completed: true, relatedEventIds: [competition.id] },
      [],
      [],
      "one",
      first,
    );
    await saveLessonOccurrence(
      { ...second, completed: true, relatedEventIds: [medal.id] },
      [],
      [],
      "one",
      second,
    );
    expect((await db.lessons.get(first.id))?.relatedEventIds).toEqual([
      competition.id,
    ]);
    expect((await db.lessons.get(second.id))?.relatedEventIds).toEqual([
      medal.id,
    ]);
    expect((await db.lessons.get(third.id))?.relatedEventIds).toEqual([]);
    expect((await db.lessons.get(first.id))?.relatedGoalIds).toEqual([]);
    expect((await db.events.get(competition.id))?.goalIds).toEqual([goal.id]);
    expect((await db.goals.get(goal.id))?.eventIds).toContain(competition.id);
  });
  it("moves one occurrence without changing its notes or other dates", async () => {
    await createLessonSchedule(schedule());
    const original = (await db.lessons.orderBy("date").first())!;
    await saveLessonOccurrence(
      { ...original, date: "2026-09-23", homework: "宿題" },
      [],
      [],
      "one",
      original,
    );
    const changed = (await db.lessons.get(original.id))!;
    expect(changed.originalDate).toBe("2026-09-21");
    expect(changed.homework).toBe("宿題");
    expect(await db.lessons.where("date").equals("2026-09-28").count()).toBe(1);
  });
  it("bulk shifts future same-weekday dates, preserving exceptions and other weekdays", async () => {
    await createLessonSchedule({ ...schedule(), weekdays: [1, 4] });
    const mondays = (await db.lessons.orderBy("date").toArray()).filter(
      (l) => new Date(`${l.date}T12:00:00`).getDay() === 1,
    );
    const [past, anchor, moved, cancelled, completed, next] = mondays;
    await save("lessons", { ...moved, date: "2026-10-07" });
    await save("lessons", { ...cancelled, cancelled: true });
    await save("lessons", { ...completed, completed: true });
    await save("lessons", { ...next, homework: "保持するメモ" });
    expect((await followingLessonDates(anchor, "2026-09-29")).length).toBe(2);
    await saveLessonOccurrence(
      { ...anchor, date: "2026-09-29" },
      [],
      [],
      "following",
      anchor,
    );
    expect((await db.lessons.get(past.id))?.date).toBe(past.date);
    expect((await db.lessons.get(moved.id))?.date).toBe("2026-10-07");
    expect((await db.lessons.get(cancelled.id))?.date).toBe(cancelled.date);
    expect((await db.lessons.get(completed.id))?.date).toBe(completed.date);
    expect((await db.lessons.get(next.id))?.date).toBe("2026-10-27");
    expect((await db.lessons.get(next.id))?.homework).toBe("保持するメモ");
    expect(await db.lessons.where("date").equals("2026-10-29").count()).toBe(1);
    expect(
      (await previewLessonSchedule(schedule())).every((day) => day.duplicate),
    ).toBe(true);
    const shiftedAnchor = (await db.lessons.get(anchor.id))!;
    expect(
      (await followingLessonDates(shiftedAnchor, "2026-09-30")).length,
    ).toBe(2);
  });
  it("keeps cancelled lessons out of next-lesson and completed counts and allows restoration", async () => {
    await createLessonSchedule(schedule());
    const first = (await db.lessons.orderBy("date").first())!;
    await save("lessons", {
      ...first,
      cancelled: true,
      cancellationReason: "お休み",
    });
    expect((await home("2026-09-20")).nextLesson?.date).toBe("2026-09-28");
    await expect(
      save("lessons", { ...first, cancelled: true, completed: true }),
    ).rejects.toThrow("実施済み");
    await save("lessons", { ...first, cancelled: false });
    expect((await home("2026-09-20")).nextLesson?.id).toBe(first.id);
    await save("lessons", { ...first, completed: true, homework: "宿題" });
    expect((await previousLesson("2026-09-28", "other"))?.homework).toBe(
      "宿題",
    );
  });
  it("rolls back all date shifts on invalid anchor edits", async () => {
    await createLessonSchedule(schedule());
    const first = (await db.lessons.orderBy("date").first())!;
    await expect(
      saveLessonOccurrence(
        { ...first, date: "2026-09-22", durationMinutes: -1 },
        [],
        [],
        "following",
        first,
      ),
    ).rejects.toThrow("時間");
    expect(await db.lessons.where("date").equals("2026-09-28").count()).toBe(1);
    expect((await db.lessons.get(first.id))?.date).toBe(first.date);
  });
  it("upgrades legacy lessons without changing their status or content", async () => {
    const name = `legacy-lessons-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ lessons: "id, date, *relatedGoalIds" });
    const lesson = {
      ...base(),
      date: "2026-09-20",
      title: "既存",
      relatedGoalIds: [],
      completed: true,
      homework: "宿題",
    };
    await old.table("lessons").add(lesson);
    old.close();
    const upgraded = new DanceDatabase(name);
    try {
      expect(await upgraded.lessons.get(lesson.id)).toEqual(lesson);
      expect(upgraded.lessons.schema.idxByName.seriesId).toBeDefined();
    } finally {
      await upgraded.delete();
    }
  });
});
