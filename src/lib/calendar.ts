import { addDays, localDate, monthRange } from "./dates";

export const calendarWeekdays = ["日", "月", "火", "水", "木", "金", "土"];
const weekStartKey = "dance-note:calendar-week-start";

export function readWeekStart(): number {
  try {
    const value = localStorage.getItem(weekStartKey);
    return value !== null && /^[0-6]$/.test(value) ? Number(value) : 1;
  } catch {
    return 1;
  }
}
export function saveWeekStart(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 6) return;
  try {
    localStorage.setItem(weekStartKey, String(value));
  } catch {
    /* Storage may be disabled. */
  }
}
export function calendarDays(month: string, weekStart: number) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00`).getDay();
  const offset = (weekday - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, index) =>
    addDays(first, index - offset),
  );
}
export function shiftCalendarMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return localDate(date).slice(0, 7);
}
export function dateAllowed(value: string, min?: string, max?: string) {
  return (
    /^\d{4}-\d{2}(-\d{2})?$/.test(value) &&
    value >= "0001-01" &&
    (!min || value >= min) &&
    (!max || value <= max)
  );
}
export function monthAllowed(month: string, min?: string, max?: string) {
  const range = monthRange(month);
  return (!min || range.end >= min) && (!max || range.start <= max);
}
export function calendarValueLabel(value: string, type: "date" | "month") {
  if (!value) return "";
  return type === "month"
    ? `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月`
    : `${value.replaceAll("-", "/")}（${calendarWeekdays[new Date(`${value}T12:00:00`).getDay()]}）`;
}
