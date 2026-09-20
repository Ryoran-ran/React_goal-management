import type { Lesson } from "../types";
import { db } from "./db";
import { base, save } from "./repository";
import { addDays, daysUntil } from "../lib/dates";
import { weeklyDates, weekday, type WeeklySchedule } from "../lib/recurrence";

export interface LessonSchedule extends Omit<WeeklySchedule, "endDate"> {
  endDate?: string;
  title: string;
  durationMinutes?: number;
  excludedDates: string[];
}
export const seriesPrefix = "ongoing-lesson-series:";
export interface OngoingLessonSeries {
  seriesId: string;
  schedule: LessonSchedule;
  generatedThrough: string;
  shifts: { from: string; weekday: number; delta: number }[];
  revision?: number;
  stoppedFrom?: string;
}
function initialRange(schedule: LessonSchedule): WeeklySchedule {
  return {
    ...schedule,
    endDate: schedule.endDate || addDays(schedule.startDate, 55),
  };
}
export function newOccurrence(
  schedule: LessonSchedule,
  seriesId: string,
  originalDate: string,
  date = originalDate,
): Lesson {
  return {
    ...base(),
    title: schedule.title.trim(),
    date,
    originalDate,
    seriesId,
    ...(date !== originalDate ? { seriesDate: date } : {}),
    durationMinutes: schedule.durationMinutes,
    relatedEventIds: [],
    relatedGoalIds: [],
    plannedTopics: [],
    actualTopics: [],
    attachmentIds: [],
    completed: false,
    cancelled: false,
  };
}
export async function previewLessonSchedule(schedule: LessonSchedule) {
  const range = initialRange(schedule);
  const dates = weeklyDates(range);
  const possibleDuplicates = [
    ...(await db.lessons
      .where("date")
      .between(range.startDate, range.endDate, true, true)
      .toArray()),
    ...(await db.lessons
      .where("originalDate")
      .between(range.startDate, range.endDate, true, true)
      .toArray()),
  ];
  const title = schedule.title.trim();
  return dates.map((date) => ({
    date,
    excluded: schedule.excludedDates.includes(date),
    duplicate: possibleDuplicates.some(
      (lesson) =>
        (lesson.title ?? "").trim() === title &&
        (lesson.date === date || lesson.originalDate === date),
    ),
  }));
}
export async function createLessonSchedule(schedule: LessonSchedule) {
  return db.transaction("rw", db.tables, async () => {
    const preview = await previewLessonSchedule(schedule);
    const selected = preview.filter((day) => !day.excluded && !day.duplicate);
    if (!selected.length)
      throw new Error(
        "登録する日がありません。曜日・期間・除外日を確認してください。",
      );
    const seriesId = crypto.randomUUID();
    for (const { date } of selected) {
      await save("lessons", newOccurrence(schedule, seriesId, date));
    }
    {
      const series: OngoingLessonSeries = {
        seriesId,
        schedule,
        generatedThrough: initialRange(schedule).endDate,
        shifts: [],
      };
      await db.settings.put({ id: seriesPrefix + seriesId, value: series });
    }
    return { created: selected.length, firstDate: selected[0].date };
  });
}

// Persist the recurrence separately from its occurrences. The cursor also keeps
// deleted, excluded and rescheduled occurrences from being recreated.
export async function ensureLessonSchedules(through: string) {
  return db.transaction("rw", db.tables, async () => {
    const settings = await db.settings
      .where("id")
      .startsWith(seriesPrefix)
      .toArray();
    for (const setting of settings) {
      const series = setting.value as OngoingLessonSeries;
      if (series.stoppedFrom) continue;
      const advance = series.shifts.reduce(
        (sum, shift) => sum + Math.min(0, shift.delta),
        0,
      );
      const actualThrough =
        series.schedule.endDate && series.schedule.endDate < through
          ? series.schedule.endDate
          : through;
      const originalThrough = addDays(actualThrough, -advance);
      if (originalThrough <= series.generatedThrough) continue;
      let start = addDays(series.generatedThrough, 1);
      while (start <= originalThrough) {
        const end = [addDays(start, 365), originalThrough].sort()[0];
        const dates = weeklyDates({
          ...series.schedule,
          startDate: start,
          endDate: end,
        });
        for (const originalDate of dates) {
          if (series.schedule.excludedDates.includes(originalDate)) continue;
          const delta = series.shifts
            .filter(
              (shift) =>
                originalDate >= shift.from &&
                weekday(originalDate) === shift.weekday,
            )
            .reduce((sum, shift) => sum + shift.delta, 0);
          const date = addDays(originalDate, delta);
          if (series.schedule.endDate && date > series.schedule.endDate)
            continue;
          const existing = [
            ...(await db.lessons.where("date").equals(date).toArray()),
            ...(await db.lessons
              .where("originalDate")
              .equals(originalDate)
              .toArray()),
          ];
          if (
            existing.some(
              (lesson) =>
                (lesson.title ?? "").trim() === series.schedule.title.trim(),
            )
          )
            continue;
          await save(
            "lessons",
            newOccurrence(series.schedule, series.seriesId, originalDate, date),
          );
        }
        start = addDays(end, 1);
      }
      await db.settings.put({
        ...setting,
        value: { ...series, generatedThrough: originalThrough },
      });
    }
  });
}

// Date changes to an individual occurrence are exceptions, so future bulk
// changes leave those dates, cancellations and completed lessons untouched.
export async function followingLessonDates(anchor: Lesson, nextDate: string) {
  if (
    !anchor.seriesId ||
    anchor.date !== (anchor.seriesDate ?? anchor.originalDate) ||
    anchor.completed ||
    anchor.cancelled
  )
    return [];
  const delta = daysUntil(nextDate, anchor.date);
  if (!Number.isFinite(delta)) return [];
  const ongoing = await db.settings.get(seriesPrefix + anchor.seriesId);
  const lessons = await db.lessons
    .where("seriesId")
    .equals(anchor.seriesId)
    .toArray();
  return lessons
    .filter(
      (lesson) =>
        lesson.id !== anchor.id &&
        !lesson.completed &&
        !lesson.cancelled &&
        lesson.date === (lesson.seriesDate ?? lesson.originalDate) &&
        lesson.date > anchor.date &&
        (ongoing
          ? weekday(lesson.originalDate!) === weekday(anchor.originalDate!)
          : weekday(lesson.date) === weekday(anchor.date)),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((lesson) => ({
      id: lesson.id,
      from: lesson.date,
      to: addDays(lesson.date, delta),
    }));
}
export async function saveLessonOccurrence(
  lesson: Lesson,
  files: File[],
  removedImages: string[],
  scope: "one" | "following",
  original: Lesson,
  fileSectionIds: (string | undefined)[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    if (scope === "following" && lesson.date !== original.date) {
      const current = await db.lessons.get(lesson.id);
      if (
        !current ||
        current.updatedAt !== original.updatedAt ||
        current.date !== original.date
      )
        throw new Error("予定が更新されています。一覧から開き直してください。");
      if (
        !current.seriesId ||
        current.date !== (current.seriesDate ?? current.originalDate) ||
        current.completed ||
        current.cancelled ||
        lesson.completed ||
        lesson.cancelled
      )
        throw new Error("まとめて日付変更できるのは未変更の予定のみです。");
      const following = await followingLessonDates(current, lesson.date);
      for (const change of following) {
        const next = (await db.lessons.get(change.id))!;
        await save("lessons", {
          ...next,
          date: change.to,
          seriesDate: change.to,
        });
      }
      await save(
        "lessons",
        { ...lesson, seriesDate: lesson.date },
        files,
        removedImages,
        fileSectionIds,
      );
      const setting = await db.settings.get(seriesPrefix + current.seriesId);
      if (setting) {
        const series = setting.value as OngoingLessonSeries;
        await db.settings.put({
          ...setting,
          value: {
            ...series,
            revision: (series.revision ?? 0) + 1,
            shifts: [
              ...series.shifts,
              {
                from: current.originalDate!,
                weekday: weekday(current.originalDate!),
                delta: daysUntil(lesson.date, current.date),
              },
            ],
          },
        });
      }
    } else {
      await save("lessons", lesson, files, removedImages, fileSectionIds);
    }
  });
}
