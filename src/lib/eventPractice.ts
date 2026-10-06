import type {
  DanceEvent,
  EventPracticeSession,
  EventPracticeStatus,
  EventPracticeTemplate,
} from "../types";
import { addDays, localDate } from "./dates";

export const eventPracticeKinds = {
  lesson: "レッスン",
  practice: "自主練習",
  custom: "その他",
} as const;

export const eventPracticeStatuses: Record<EventPracticeStatus, string> = {
  planned: "予定",
  completed: "実施済み",
  cancelled: "中止",
};

export const eventPracticeTemplatesSetting = "event-practice-templates";

export function eventPracticeTitle(session: EventPracticeSession) {
  return session.title.trim() || eventPracticeKinds[session.kind];
}

export function eventPracticeDisplayStatus(
  session: EventPracticeSession,
  today = localDate(),
) {
  return session.status === "planned" && session.date < today
    ? "missed"
    : session.status;
}

export function eventPracticeSummary(event: DanceEvent, today = localDate()) {
  const sessions = event.practiceSessions ?? [];
  return {
    upcoming: sessions.filter(
      (session) =>
        session.status === "planned" &&
        session.date >= today &&
        session.date <= event.date,
    ).length,
    completed: sessions.filter((session) => session.status === "completed")
      .length,
    missed: sessions.filter(
      (session) => session.status === "planned" && session.date < today,
    ).length,
    cancelled: sessions.filter((session) => session.status === "cancelled")
      .length,
  };
}

export function eventPracticePromptSummary(
  event: DanceEvent,
  today = localDate(),
) {
  const sessions = event.practiceSessions ?? [];
  const remaining = sessions.filter(
    (session) =>
      session.status === "planned" &&
      session.date >= today &&
      session.date <= event.date,
  );
  const summary = eventPracticeSummary(event, today);
  return {
    scheduledRemaining: summary.upcoming,
    completed: summary.completed,
    missed: summary.missed,
    cancelled: summary.cancelled,
    remainingByType: {
      lesson: remaining.filter((session) => session.kind === "lesson").length,
      selfPractice: remaining.filter((session) => session.kind === "practice")
        .length,
      other: remaining.filter((session) => session.kind === "custom").length,
    },
  };
}

export function sortedEventPracticeSessions(items: EventPracticeSession[]) {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function shiftEventPracticeSessions(
  items: EventPracticeSession[],
  days: number,
) {
  return items.map((session) =>
    session.status === "planned"
      ? { ...session, date: addDays(session.date, days) }
      : session,
  );
}

const validDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  localDate(new Date(`${value}T12:00:00`)) === value;

export function validateEventPracticeSessions(value: unknown) {
  if (value === undefined) return;
  if (!Array.isArray(value))
    throw new Error("練習予定の形式が正しくありません。");
  const ids = new Set<string>();
  for (const item of value) {
    const session = item as EventPracticeSession;
    if (
      !session ||
      typeof session !== "object" ||
      typeof session.id !== "string" ||
      !session.id ||
      ids.has(session.id) ||
      typeof session.createdAt !== "string" ||
      Number.isNaN(Date.parse(session.createdAt)) ||
      typeof session.updatedAt !== "string" ||
      Number.isNaN(Date.parse(session.updatedAt)) ||
      !validDate(session.date) ||
      !Object.hasOwn(eventPracticeKinds, session.kind) ||
      !Object.hasOwn(eventPracticeStatuses, session.status) ||
      typeof session.title !== "string" ||
      session.title.length > 200 ||
      (session.kind === "custom" && !session.title.trim()) ||
      typeof session.memo !== "string" ||
      session.memo.length > 5000 ||
      (session.templateId !== undefined &&
        (typeof session.templateId !== "string" || !session.templateId))
    )
      throw new Error("練習予定の日付・種類・名前・状態を確認してください。");
    ids.add(session.id);
  }
}

export function validEventPracticeTemplates(
  value: unknown,
): value is EventPracticeTemplate[] {
  return (
    Array.isArray(value) &&
    new Set(value.map((item) => item?.id)).size === value.length &&
    value.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        !!item.id &&
        typeof item.title === "string" &&
        !!item.title.trim() &&
        item.title.length <= 200 &&
        typeof item.memo === "string" &&
        item.memo.length <= 5000,
    )
  );
}
