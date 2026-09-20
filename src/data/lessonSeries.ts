import type { Lesson } from "../types";
import { db } from "./db";
import { save } from "./repository";
import { addDays, localDate } from "../lib/dates";
import { weekday, weeklyDates } from "../lib/recurrence";
import {
  ensureLessonSchedules,
  newOccurrence,
  seriesPrefix,
  type LessonSchedule,
  type OngoingLessonSeries,
} from "./lessonSchedule";

export interface ManagedLessonSeries extends OngoingLessonSeries {
  inferred?: boolean;
  plannedCount: number;
  completedCount: number;
}
export interface SeriesChange {
  from: string;
  title: string;
  weekdays: number[];
  durationMinutes?: number;
  endDate?: string;
  stop: boolean;
}
export async function listLessonSeries(): Promise<ManagedLessonSeries[]> {
  const [settings, lessons] = await Promise.all([
    db.settings.where("id").startsWith(seriesPrefix).toArray(),
    db.lessons.toArray(),
  ]);
  const series = new Map(
    settings.map((setting) => {
      const value = setting.value as OngoingLessonSeries;
      return [value.seriesId, value];
    }),
  );
  const grouped = new Map<string, Lesson[]>();
  for (const lesson of lessons)
    if (lesson.seriesId)
      grouped.set(lesson.seriesId, [
        ...(grouped.get(lesson.seriesId) ?? []),
        lesson,
      ]);
  const inferred = new Set<string>();
  for (const [id, entries] of grouped)
    if (!series.has(id)) {
      const sorted = [...entries].sort((a, b) =>
        (a.originalDate ?? a.date).localeCompare(b.originalDate ?? b.date),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const end = last.originalDate ?? last.date;
      series.set(id, {
        seriesId: id,
        schedule: {
          title: first.title ?? "",
          durationMinutes: first.durationMinutes,
          startDate: first.originalDate ?? first.date,
          endDate: end,
          weekdays: [
            ...new Set(
              entries.map((lesson) =>
                weekday(lesson.originalDate ?? lesson.date),
              ),
            ),
          ],
          excludedDates: [],
        },
        generatedThrough: end,
        shifts: [],
      });
      inferred.add(id);
    }
  return [...series.values()]
    .map((item) => ({
      ...item,
      inferred: inferred.has(item.seriesId),
      plannedCount: (grouped.get(item.seriesId) ?? []).filter(
        (lesson) => !lesson.completed && !lesson.cancelled,
      ).length,
      completedCount: (grouped.get(item.seriesId) ?? []).filter(
        (lesson) => lesson.completed && !lesson.cancelled,
      ).length,
    }))
    .sort((a, b) => a.schedule.title.localeCompare(b.schedule.title, "ja"));
}
function datesBetween(schedule: LessonSchedule, end: string) {
  const dates: string[] = [];
  for (let start = schedule.startDate; start <= end;) {
    const chunkEnd = [addDays(start, 365), end].sort()[0];
    dates.push(
      ...weeklyDates({ ...schedule, startDate: start, endDate: chunkEnd }),
    );
    start = addDays(chunkEnd, 1);
  }
  return dates;
}
function shiftedDate(series: OngoingLessonSeries, original: string) {
  return addDays(
    original,
    series.shifts
      .filter(
        (shift) =>
          original >= shift.from && weekday(original) === shift.weekday,
      )
      .reduce((sum, shift) => sum + shift.delta, 0),
  );
}
export function currentSeriesWeekdays(
  series: OngoingLessonSeries,
  from: string,
) {
  return [
    ...new Set(
      weeklyDates({
        startDate: from,
        endDate: addDays(from, 6),
        weekdays: series.schedule.weekdays,
      }).map((date) => weekday(shiftedDate(series, date))),
    ),
  ];
}
function isUntouched(
  lesson: Lesson,
  series: OngoingLessonSeries,
  from: string,
) {
  return (
    lesson.date >= from &&
    !lesson.completed &&
    !lesson.cancelled &&
    lesson.date === (lesson.seriesDate ?? lesson.originalDate) &&
    (lesson.title ?? "") === series.schedule.title &&
    lesson.durationMinutes === series.schedule.durationMinutes &&
    !lesson.relatedEventIds.length &&
    !lesson.relatedGoalIds.length &&
    !lesson.plannedTopics.length &&
    !lesson.actualTopics.length &&
    !lesson.attachmentIds.length &&
    !lesson.teacherFeedback &&
    !lesson.homework &&
    !lesson.newIssues &&
    !lesson.sections?.length &&
    !lesson.cancellationReason
  );
}
export async function previewSeriesChange(
  seriesId: string,
  change: SeriesChange,
  today = localDate(),
) {
  const series = (await listLessonSeries()).find(
    (item) => item.seriesId === seriesId,
  );
  if (!series) throw new Error("繰り返し設定が見つかりません。");
  weeklyDates({
    startDate: change.from,
    endDate: change.from,
    weekdays: change.stop ? [0] : change.weekdays,
  });
  if (change.from < today)
    throw new Error("変更を反映する日は今日以降を選んでください。");
  if (change.title.trim().length > 200)
    throw new Error("レッスン名は200文字以内にしてください。");
  if (
    change.durationMinutes !== undefined &&
    (!Number.isInteger(change.durationMinutes) ||
      change.durationMinutes < 0 ||
      change.durationMinutes > 1440)
  )
    throw new Error("時間は0〜1440分で入力してください。");
  if (!change.stop && change.endDate) {
    weeklyDates({
      startDate: change.endDate,
      endDate: change.endDate,
      weekdays: change.weekdays,
    });
    if (change.endDate < change.from)
      throw new Error("終了日は変更を反映する日以降にしてください。");
  }
  const all = await db.lessons.toArray();
  const owned = all.filter((lesson) => lesson.seriesId === seriesId);
  const editable = owned.filter((lesson) =>
    isUntouched(lesson, series, change.from),
  );
  const editableIds = new Set(editable.map((lesson) => lesson.id));
  const preserved = owned.filter((lesson) => !editableIds.has(lesson.id));
  const exclusions = new Set(series.schedule.excludedDates);
  for (const lesson of preserved) {
    exclusions.add(lesson.date);
    if (lesson.originalDate) exclusions.add(lesson.originalDate);
  }
  // Keep holes left by individual deletions and explicitly excluded occurrences.
  if (!series.stoppedFrom) {
    const originals = new Set(
      owned.map((lesson) => lesson.originalDate ?? lesson.date),
    );
    const oldEnd =
      series.schedule.endDate &&
      series.schedule.endDate < series.generatedThrough
        ? series.schedule.endDate
        : series.generatedThrough;
    for (const original of datesBetween(
      {
        ...series.schedule,
        startDate: [series.schedule.startDate, change.from].sort().at(-1)!,
      },
      oldEnd,
    )) {
      if (!originals.has(original))
        exclusions.add(shiftedDate(series, original));
    }
  }
  const through = [
    addDays(change.from, 55),
    series.generatedThrough,
    ...editable.map((lesson) => lesson.date),
  ]
    .sort()
    .at(-1)!;
  const end =
    change.endDate && change.endDate < through ? change.endDate : through;
  const schedule: LessonSchedule = {
    title: change.title.trim(),
    startDate: change.from,
    endDate: change.endDate || "",
    durationMinutes: change.durationMinutes,
    weekdays: [
      ...new Set(change.stop ? series.schedule.weekdays : change.weekdays),
    ],
    excludedDates: [...exclusions],
  };
  const targetDates = change.stop
    ? []
    : datesBetween(schedule, end).filter(
        (date) =>
          !exclusions.has(date) &&
          !all.some(
            (lesson) =>
              !editableIds.has(lesson.id) &&
              (lesson.date === date || lesson.originalDate === date) &&
              (lesson.title ?? "").trim() === schedule.title,
          ),
      );
  const targets = new Set(targetDates);
  const removed = editable.filter((lesson) => !targets.has(lesson.date));
  const updated = editable.filter((lesson) => targets.has(lesson.date));
  const added = targetDates.filter(
    (date) => !updated.some((lesson) => lesson.date === date),
  );
  return {
    series,
    schedule,
    through: end,
    removed,
    updated,
    added,
    preserved: preserved.filter((lesson) => lesson.date >= change.from),
  };
}
export async function saveSeriesChange(
  seriesId: string,
  change: SeriesChange,
  revision: number,
  today = localDate(),
) {
  return db.transaction("rw", db.tables, async () => {
    const current = (await listLessonSeries()).find(
      (series) => series.seriesId === seriesId,
    );
    if (!current || (current.revision ?? 0) !== revision)
      throw new Error("設定が更新されています。一覧から開き直してください。");
    await previewSeriesChange(seriesId, change, today);
    // Materialize the old rule up to the change boundary before replacing it.
    await ensureLessonSchedules(addDays(change.from, -1));
    const preview = await previewSeriesChange(seriesId, change, today);
    for (const lesson of preview.removed) await db.lessons.delete(lesson.id);
    for (const lesson of preview.updated)
      await save("lessons", {
        ...lesson,
        title: preview.schedule.title,
        durationMinutes: preview.schedule.durationMinutes,
        originalDate: lesson.date,
        seriesDate: undefined,
      });
    for (const date of preview.added)
      await save("lessons", newOccurrence(preview.schedule, seriesId, date));
    const series: OngoingLessonSeries = {
      seriesId,
      schedule: preview.schedule,
      generatedThrough: preview.through,
      shifts: [],
      revision: revision + 1,
      stoppedFrom: change.stop ? change.from : undefined,
    };
    await db.settings.put({ id: seriesPrefix + seriesId, value: series });
    return {
      updated: preview.updated.length,
      removed: preview.removed.length,
      added: preview.added.length,
      preserved: preview.preserved.length,
    };
  });
}

export async function previewSeriesDeletion(
  seriesId: string,
  today = localDate(),
) {
  const series = (await listLessonSeries()).find(
    (item) => item.seriesId === seriesId,
  );
  if (!series) throw new Error("繰り返し設定が見つかりません。");
  const lessons = await db.lessons.where("seriesId").equals(seriesId).toArray();
  const removed = lessons.filter((lesson) =>
    isUntouched(lesson, series, today),
  );
  const removedIds = new Set(removed.map((lesson) => lesson.id));
  return {
    series,
    removed,
    preserved: lessons.filter((lesson) => !removedIds.has(lesson.id)),
  };
}

export async function deleteLessonSeries(
  seriesId: string,
  revision: number,
  today = localDate(),
) {
  return db.transaction("rw", db.tables, async () => {
    const preview = await previewSeriesDeletion(seriesId, today);
    if ((preview.series.revision ?? 0) !== revision)
      throw new Error("設定が更新されています。一覧から開き直してください。");
    for (const lesson of preview.removed) await db.lessons.delete(lesson.id);
    // Retained records become standalone. Otherwise legacy-series discovery
    // would recreate the deleted parent from these records on the next read.
    for (const lesson of preview.preserved) {
      const standalone = { ...lesson, updatedAt: new Date().toISOString() };
      delete standalone.seriesId;
      delete standalone.seriesDate;
      await db.lessons.put(standalone);
    }
    await db.settings.delete(seriesPrefix + seriesId);
    return {
      removed: preview.removed.length,
      preserved: preview.preserved.length,
    };
  });
}
