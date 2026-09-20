import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  createLessonSchedule,
  ensureLessonSchedules,
  seriesPrefix,
} from "./lessonSchedule";
import {
  listLessonSeries,
  deleteLessonSeries,
  previewSeriesDeletion,
  previewSeriesChange,
  saveSeriesChange,
  type SeriesChange,
} from "./lessonSeries";
import { save, watch } from "./repository";

const today = "2026-09-20";
const draft = {
  title: "個人レッスン",
  startDate: "2026-09-21",
  endDate: "",
  weekdays: [1],
  durationMinutes: 30,
  excludedDates: [],
};
const change = (updates: Partial<SeriesChange> = {}): SeriesChange => ({
  from: "2026-09-28",
  title: "個人レッスン",
  weekdays: [1],
  durationMinutes: 30,
  endDate: "",
  stop: false,
  ...updates,
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());
describe("recurring lesson management", () => {
  it("deletes a parent and pristine future dates while keeping history, exceptions and images as standalone records", async () => {
    await createLessonSchedule(draft);
    const series = (await listLessonSeries())[0];
    const [past, completed, note, moved, cancelled] = await db.lessons
      .orderBy("date")
      .toArray();
    await save("lessons", { ...completed, completed: true });
    await save("lessons", { ...note, homework: "保持するメモ" }, [
      new File(["image"], "lesson.png", { type: "image/png" }),
    ]);
    await save("lessons", { ...moved, date: "2026-10-14" });
    await save("lessons", { ...cancelled, cancelled: true });
    const other = {
      ...past,
      id: "other-lesson",
      seriesId: undefined,
      title: "単発",
    };
    await save("lessons", other);
    const preview = await previewSeriesDeletion(series.seriesId, "2026-09-28");
    expect(preview.removed).toHaveLength(3);
    expect(preview.preserved).toHaveLength(5);
    expect(await deleteLessonSeries(series.seriesId, 0, "2026-09-28")).toEqual({
      removed: 3,
      preserved: 5,
    });
    const retained = await db.lessons.toArray();
    expect(retained).toHaveLength(6);
    expect(retained.every((lesson) => lesson.seriesId === undefined)).toBe(
      true,
    );
    expect((await db.lessons.get(note.id))?.homework).toBe("保持するメモ");
    expect((await db.lessons.get(note.id))?.attachmentIds).toHaveLength(1);
    expect(await db.attachmentFiles.count()).toBe(1);
    db.close();
    await db.open();
    expect(await listLessonSeries()).toEqual([]);
    await ensureLessonSchedules("2027-12-31");
    expect(await db.lessons.count()).toBe(6);
  });
  it("deletes inferred legacy series and refuses stale parent deletion", async () => {
    await createLessonSchedule({ ...draft, endDate: "2026-10-12" });
    const series = (await listLessonSeries())[0];
    await db.settings.delete(seriesPrefix + series.seriesId);
    await expect(deleteLessonSeries(series.seriesId, 1, today)).rejects.toThrow(
      "更新されています",
    );
    expect(await db.lessons.count()).toBe(4);
    await deleteLessonSeries(series.seriesId, 0, "2026-09-28");
    expect(await db.lessons.count()).toBe(1);
    expect(await listLessonSeries()).toEqual([]);
  });
  it("rolls back occurrence deletion and detachment if deleting the parent fails", async () => {
    await createLessonSchedule(draft);
    const series = (await listLessonSeries())[0];
    const before = await db.lessons.toArray();
    const failure = vi
      .spyOn(db.settings, "delete")
      .mockRejectedValueOnce(new Error("delete failed"));
    try {
      await expect(
        deleteLessonSeries(series.seriesId, 0, "2026-09-28"),
      ).rejects.toThrow("delete failed");
    } finally {
      failure.mockRestore();
    }
    expect(await db.lessons.toArray()).toEqual(before);
    expect(await listLessonSeries()).toHaveLength(1);
  });
  it("lists ongoing and finite series, including older materialized-only series", async () => {
    await createLessonSchedule(draft);
    await createLessonSchedule({
      ...draft,
      title: "旧レッスン",
      endDate: "2026-10-12",
    });
    const finite = (await listLessonSeries()).find(
      (series) => series.schedule.title === "旧レッスン",
    )!;
    await db.settings.delete(seriesPrefix + finite.seriesId);
    const list = await listLessonSeries();
    expect(list).toHaveLength(2);
    expect(
      list.find((series) => series.seriesId === finite.seriesId),
    ).toMatchObject({
      inferred: true,
      schedule: { endDate: "2026-10-12", weekdays: [1] },
    });
  });
  it("changes future defaults while preserving record IDs, earlier dates, notes and exceptions", async () => {
    await createLessonSchedule(draft);
    const series = (await listLessonSeries())[0];
    const [past, editable, note, moved, cancelled, completed, deleted] =
      await db.lessons.orderBy("date").toArray();
    await save("lessons", { ...note, homework: "保持する宿題" }, [
      new File(["x"], "note.png", { type: "image/png" }),
    ]);
    await save("lessons", { ...moved, date: "2026-10-14" });
    await save("lessons", { ...cancelled, cancelled: true });
    await save("lessons", { ...completed, completed: true });
    await db.lessons.delete(deleted.id);
    const edits = change({ title: "新しい名前", durationMinutes: 45 });
    const preview = await previewSeriesChange(series.seriesId, edits, today);
    expect(preview.preserved).toHaveLength(4);
    await saveSeriesChange(series.seriesId, edits, 0, today);
    expect((await db.lessons.get(past.id))?.title).toBe(draft.title);
    expect(await db.lessons.get(editable.id)).toMatchObject({
      title: "新しい名前",
      durationMinutes: 45,
      date: editable.date,
    });
    expect((await db.lessons.get(note.id))?.homework).toBe("保持する宿題");
    expect((await db.lessons.get(note.id))?.attachmentIds).toHaveLength(1);
    expect((await db.lessons.get(moved.id))?.date).toBe("2026-10-14");
    expect((await db.lessons.get(cancelled.id))?.cancelled).toBe(true);
    expect((await db.lessons.get(completed.id))?.completed).toBe(true);
    expect(await db.lessons.where("date").equals(deleted.date).count()).toBe(0);
    await ensureLessonSchedules("2027-01-31");
    expect(
      (await db.lessons.where("date").equals("2027-01-04").first())?.title,
    ).toBe("新しい名前");
  });
  it("replaces pristine future dates, respects an end date, and supports stopping and restarting", async () => {
    await createLessonSchedule(draft);
    const { seriesId } = (await listLessonSeries())[0];
    await saveSeriesChange(
      seriesId,
      change({ weekdays: [2], endDate: "2026-10-20" }),
      0,
      today,
    );
    expect(await db.lessons.where("date").equals("2026-09-28").count()).toBe(0);
    expect(await db.lessons.where("date").equals("2026-09-29").count()).toBe(1);
    await ensureLessonSchedules("2027-01-31");
    expect(await db.lessons.where("date").above("2026-10-20").count()).toBe(0);
    await saveSeriesChange(
      seriesId,
      change({ from: "2026-10-06", weekdays: [2], stop: true }),
      1,
      today,
    );
    await ensureLessonSchedules("2027-01-31");
    expect(
      await db.lessons.where("date").aboveOrEqual("2026-10-06").count(),
    ).toBe(0);
    await saveSeriesChange(
      seriesId,
      change({ from: "2026-11-03", weekdays: [2] }),
      2,
      today,
    );
    await ensureLessonSchedules("2027-01-31");
    expect(await db.lessons.where("date").equals("2026-11-03").count()).toBe(1);
    expect(await db.lessons.where("date").equals("2027-01-05").count()).toBe(1);
  });
  it("rejects stale and invalid changes without modifying occurrences", async () => {
    await createLessonSchedule(draft);
    const series = (await listLessonSeries())[0];
    const before = await db.lessons.toArray();
    await expect(
      saveSeriesChange(
        series.seriesId,
        change({ from: "2026-09-01" }),
        0,
        today,
      ),
    ).rejects.toThrow("今日以降");
    await expect(
      saveSeriesChange(
        series.seriesId,
        change({ durationMinutes: -1 }),
        0,
        today,
      ),
    ).rejects.toThrow("時間");
    expect(await db.lessons.toArray()).toEqual(before);
    await saveSeriesChange(
      series.seriesId,
      change({ durationMinutes: 45 }),
      0,
      today,
    );
    await expect(
      saveSeriesChange(series.seriesId, change(), 0, today),
    ).rejects.toThrow("更新されています");
  });
  it("reads management lists and previews through liveQuery without writes", async () => {
    await createLessonSchedule(draft);
    const series = (await listLessonSeries())[0];
    await new Promise<void>((resolve, reject) => {
      const sub = watch(
        async () => ({
          list: await listLessonSeries(),
          preview: await previewSeriesChange(series.seriesId, change(), today),
        }),
        (result) => {
          sub.unsubscribe();
          expect(result.list).toHaveLength(1);
          expect(result.preview.updated.length).toBeGreaterThan(0);
          resolve();
        },
        (error) => {
          sub.unsubscribe();
          reject(error);
        },
      );
    });
  });
});
