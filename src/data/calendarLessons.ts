import { db } from "./db";
import { addDays } from "../lib/dates";
import { weekday } from "../lib/recurrence";
import { seriesPrefix, type OngoingLessonSeries } from "./lessonSchedule";

// Preview only the visible days. Browsing a distant month must not create years
// of lesson records, or write from inside Dexie's liveQuery context.
export async function calendarLessons(
  start: string,
  end: string,
): Promise<Record<string, number>> {
  const lessons = await db.lessons
    .where("date")
    .between(start, end, true, true)
    .toArray();
  const counts: Record<string, number> = {};
  const key = (title: string, date: string) =>
    JSON.stringify([title.trim(), date]);
  const knownDates = new Set(
    lessons.map((lesson) => key(lesson.title ?? "", lesson.date)),
  );
  const knownOriginals = new Set(
    lessons
      .filter((lesson) => lesson.originalDate)
      .map((lesson) => key(lesson.title ?? "", lesson.originalDate!)),
  );
  for (const lesson of lessons) {
    if (!lesson.cancelled) counts[lesson.date] = (counts[lesson.date] ?? 0) + 1;
  }
  const settings = await db.settings
    .where("id")
    .startsWith(seriesPrefix)
    .toArray();
  for (const setting of settings) {
    const series = setting.value as OngoingLessonSeries;
    if (series.stoppedFrom) continue;
    const { schedule } = series;
    // Every possible cumulative shift, grouped by the original weekday.
    const offsets = new Set([0]);
    const sums = new Map<number, number>();
    for (const shift of [...series.shifts].sort((a, b) =>
      a.from.localeCompare(b.from),
    )) {
      const sum = (sums.get(shift.weekday) ?? 0) + shift.delta;
      sums.set(shift.weekday, sum);
      offsets.add(sum);
    }
    const candidates: { original: string; date: string }[] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (schedule.endDate && date > schedule.endDate) continue;
      for (const offset of offsets) {
        const original = addDays(date, -offset);
        if (
          original <= series.generatedThrough ||
          original < schedule.startDate ||
          !schedule.weekdays.includes(weekday(original)) ||
          schedule.excludedDates.includes(original)
        )
          continue;
        const delta = series.shifts
          .filter(
            (shift) =>
              original >= shift.from && weekday(original) === shift.weekday,
          )
          .reduce((sum, shift) => sum + shift.delta, 0);
        if (delta === offset) candidates.push({ original, date });
      }
    }
    if (!candidates.length) continue;
    const existing = await db.lessons
      .where("originalDate")
      .anyOf(candidates.map((item) => item.original))
      .toArray();
    for (const lesson of existing) {
      knownDates.add(key(lesson.title ?? "", lesson.date));
      knownOriginals.add(key(lesson.title ?? "", lesson.originalDate!));
    }
    for (const { original, date } of candidates.sort((a, b) =>
      a.original.localeCompare(b.original),
    )) {
      const title = schedule.title.trim();
      if (
        knownDates.has(key(title, date)) ||
        knownOriginals.has(key(title, original))
      )
        continue;
      counts[date] = (counts[date] ?? 0) + 1;
      // Match the recurrence generator's same-title/date deduplication across series.
      knownDates.add(key(title, date));
      knownOriginals.add(key(title, original));
    }
  }
  return counts;
}
