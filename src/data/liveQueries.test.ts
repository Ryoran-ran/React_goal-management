import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { home, list, watch } from "./repository";
import { agendaBetween, practiceAgenda } from "./practiceAgenda";
import { createLessonSchedule, ensureLessonSchedules } from "./lessonSchedule";

function firstValue<T>(
  query: () => Promise<T>,
  prepare?: () => Promise<unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const subscription = watch(
      query,
      (value) => {
        subscription.unsubscribe();
        resolve(value);
      },
      (error) => {
        subscription.unsubscribe();
        reject(error);
      },
      prepare,
    );
  });
}
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("screen live queries", () => {
  it("generates open-ended lessons before observing home and future agenda screens", async () => {
    await createLessonSchedule({
      title: "毎週のレッスン",
      startDate: "2026-09-21",
      endDate: "",
      weekdays: [1],
      excludedDates: [],
    });
    const prepare = () => ensureLessonSchedules("2027-01-31");
    const [overview, agenda, lessons, upcoming] = await Promise.all([
      firstValue(() => home("2027-01-01"), prepare),
      firstValue(() => practiceAgenda("2027-01"), prepare),
      firstValue(() => list("lessons", "2027-01"), prepare),
      firstValue(() => agendaBetween("2027-01-01", "2027-01-07"), prepare),
    ]);
    expect(overview.nextLesson?.date).toBe("2027-01-04");
    expect(agenda.map((item) => item.record.date)).toEqual([
      "2027-01-04",
      "2027-01-11",
      "2027-01-18",
      "2027-01-25",
    ]);
    expect(lessons).toHaveLength(4);
    expect(upcoming).toHaveLength(1);
  });
  it("surfaces preparation failures and never starts a subscription after cleanup", async () => {
    const failure = new Error("予定の準備に失敗しました");
    await expect(
      firstValue(
        () => home("2026-09-20"),
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let queried = false;
    const subscription = watch(
      async () => {
        queried = true;
        return 0;
      },
      () => {},
      () => {},
      () => pending,
    );
    subscription.unsubscribe();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queried).toBe(false);
  });
  it("reads home and agenda screens in the same liveQuery context used by React", async () => {
    const [overview, agenda, lessons, upcoming] = await Promise.all([
      firstValue(() => home("2026-09-20")),
      firstValue(() => practiceAgenda("2026-09")),
      firstValue(() => list("lessons", "2026-09")),
      firstValue(() => agendaBetween("2026-09-20", "2026-09-27")),
    ]);
    expect(overview.nextLesson).toBeUndefined();
    expect(agenda).toEqual([]);
    expect(lessons).toEqual([]);
    expect(upcoming).toEqual([]);
  });
});
