import type {
  EventPracticeSession,
  EventPracticeStatus,
  EventPracticeTemplate,
} from "../types";
import {
  eventPracticeTemplatesSetting,
  sortedEventPracticeSessions,
  validEventPracticeTemplates,
  validateEventPracticeSessions,
} from "../lib/eventPractice";
import { db } from "./db";

const nextTimestamp = (...values: (string | undefined)[]) =>
  new Date(
    Math.max(
      Date.now(),
      ...values.filter(Boolean).map((value) => Date.parse(value!) + 1),
    ),
  ).toISOString();

export async function saveEventPracticeSession(
  eventId: string,
  draft: EventPracticeSession,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    const items = event.practiceSessions ?? [];
    const previous = items.find((item) => item.id === draft.id);
    if (previous && previous.updatedAt !== draft.updatedAt)
      throw new Error(
        "練習予定が別の画面で変更されています。開き直してください。",
      );
    const now = nextTimestamp(event.updatedAt, previous?.updatedAt);
    const session: EventPracticeSession = {
      ...draft,
      title: draft.title.trim(),
      memo: draft.memo.trim(),
      updatedAt: now,
    };
    const practiceSessions = previous
      ? items.map((item) => (item.id === session.id ? session : item))
      : [...items, session];
    validateEventPracticeSessions(practiceSessions);
    await db.events.put({
      ...event,
      practiceSessions: sortedEventPracticeSessions(practiceSessions),
      updatedAt: now,
    });
  });
}

export async function setEventPracticeStatus(
  eventId: string,
  sessionId: string,
  status: EventPracticeStatus,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    const current = event?.practiceSessions?.find(
      (session) => session.id === sessionId,
    );
    if (!event || !current)
      throw new Error("練習予定が見つかりません。開き直してください。");
    if (current.status === status) return;
    const now = nextTimestamp(event.updatedAt, current.updatedAt);
    const practiceSessions = event.practiceSessions!.map((session) =>
      session.id === sessionId
        ? { ...session, status, updatedAt: now }
        : session,
    );
    validateEventPracticeSessions(practiceSessions);
    await db.events.put({ ...event, practiceSessions, updatedAt: now });
  });
}

export async function deleteEventPracticeSession(
  eventId: string,
  sessionId: string,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    if (!event.practiceSessions?.some((session) => session.id === sessionId))
      throw new Error("練習予定が見つかりません。開き直してください。");
    await db.events.put({
      ...event,
      practiceSessions: event.practiceSessions.filter(
        (session) => session.id !== sessionId,
      ),
      updatedAt: nextTimestamp(event.updatedAt),
    });
  });
}

export async function allEventPracticeTemplates() {
  const value = (await db.settings.get(eventPracticeTemplatesSetting))?.value;
  if (value === undefined) return [];
  if (!validEventPracticeTemplates(value))
    throw new Error("練習予定のテンプレートを読み込めませんでした。");
  return value;
}

export async function saveEventPracticeTemplate(
  template: EventPracticeTemplate,
) {
  const templates = await allEventPracticeTemplates();
  const next = {
    ...template,
    title: template.title.trim(),
    memo: template.memo.trim(),
  };
  if (!validEventPracticeTemplates([next]))
    throw new Error("テンプレートの名前とメモを確認してください。");
  await db.settings.put({
    id: eventPracticeTemplatesSetting,
    value: templates.some((item) => item.id === next.id)
      ? templates.map((item) => (item.id === next.id ? next : item))
      : [...templates, next],
  });
}

export async function deleteEventPracticeTemplate(id: string) {
  const templates = await allEventPracticeTemplates();
  await db.settings.put({
    id: eventPracticeTemplatesSetting,
    value: templates.filter((item) => item.id !== id),
  });
}

export async function eventPracticeBetween(start: string, end: string) {
  const events = await db.events.toArray();
  return events
    .filter((event) => event.status === "planned" || event.status === "active")
    .flatMap((event) =>
      (event.practiceSessions ?? [])
        .filter(
          (session) =>
            session.date >= start &&
            session.date <= end &&
            session.status !== "cancelled",
        )
        .map((session) => ({ event, session })),
    )
    .sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) ||
        a.event.date.localeCompare(b.event.date) ||
        a.session.createdAt.localeCompare(b.session.createdAt),
    );
}
