import type { Lesson, PracticeLog } from "../types";
import { list } from "./repository";
import { db } from "./db";

export type AgendaItem =
  | { kind: "practice"; record: PracticeLog }
  | { kind: "lesson"; record: Lesson };
export function agendaStatus(
  item: AgendaItem,
): "planned" | "recorded" | "cancelled" {
  if (item.kind === "practice") return item.record.status ?? "recorded";
  return item.record.cancelled
    ? "cancelled"
    : item.record.completed
      ? "recorded"
      : "planned";
}
function combineAgendaItems(
  practices: PracticeLog[],
  lessons: Lesson[],
): AgendaItem[] {
  return [
    ...practices.map((record) => ({ kind: "practice" as const, record })),
    ...lessons.map((record) => ({ kind: "lesson" as const, record })),
  ].sort(
    (a, b) =>
      a.record.date.localeCompare(b.record.date) ||
      a.kind.localeCompare(b.kind) ||
      a.record.id.localeCompare(b.record.id),
  );
}
// Accept a month (YYYY-MM) or a single day (YYYY-MM-DD), including cancellations.
export async function practiceAgenda(period: string): Promise<AgendaItem[]> {
  const daily = period.length === 10;
  const [practices, lessons] = await Promise.all([
    daily
      ? db.practiceLogs.where("date").equals(period).toArray()
      : list("practiceLogs", period),
    daily
      ? db.lessons.where("date").equals(period).toArray()
      : list("lessons", period),
  ]);
  return combineAgendaItems(practices, lessons);
}
export async function practiceAgendaRange(
  start: string,
  end: string,
): Promise<AgendaItem[]> {
  const [practices, lessons] = await Promise.all([
    db.practiceLogs.where("date").between(start, end, true, true).toArray(),
    db.lessons.where("date").between(start, end, true, true).toArray(),
  ]);
  return combineAgendaItems(practices, lessons);
}
export async function agendaBetween(
  start: string,
  end: string,
): Promise<AgendaItem[]> {
  const [practices, lessons] = await Promise.all([
    db.practiceLogs.where("date").between(start, end, true, true).toArray(),
    db.lessons.where("date").between(start, end, true, true).toArray(),
  ]);
  return combineAgendaItems(practices, lessons).filter(
    (item) => agendaStatus(item) !== "cancelled",
  );
}
