import { addDays, daysUntil, localDate } from "./dates";

export interface WeeklySchedule {
  startDate: string;
  endDate: string;
  weekdays: number[];
}
export const weekdayOptions = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];
export function weekday(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}
export function weeklyDates(schedule: WeeklySchedule): string[] {
  const { startDate, endDate, weekdays } = schedule;
  for (const date of [startDate, endDate]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      localDate(new Date(`${date}T12:00:00`)) !== date
    )
      throw new Error("開始日と終了日を指定してください。");
  }
  const span = daysUntil(endDate, startDate);
  if (span < 0) throw new Error("終了日は開始日以降にしてください。");
  if (span > 365) throw new Error("一度に登録できる期間は366日以内です。");
  if (
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error("曜日を1つ以上選んでください。");
  return Array.from({ length: span + 1 }, (_, index) =>
    addDays(startDate, index),
  ).filter((date) => weekdays.includes(weekday(date)));
}
