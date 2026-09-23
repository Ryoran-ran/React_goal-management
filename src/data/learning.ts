import { db } from "./db";
import { base, save } from "./repository";
import { agendaBetween, type AgendaItem } from "./practiceAgenda";
import { lessonHomework } from "../lib/lessonContent";
import type { LearningNote, LearningTheme } from "../types";
import { eventWorkForToday } from "../lib/eventWork";

export const allThemes = () =>
  db.themes
    .toArray()
    .then((themes) =>
      themes.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
export const allLearningNotes = () =>
  db.learningNotes
    .toArray()
    .then((notes) =>
      notes.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    );
export function newTheme(): LearningTheme {
  return {
    ...base(),
    title: "",
    category: "",
    destination: "",
    nextStep: "",
    status: "active",
    eventIds: [],
    goalIds: [],
  };
}
export function newLearningNote(
  date: string,
  themeId?: string,
  source?: AgendaItem,
): LearningNote {
  return {
    ...base(),
    date: source?.record.date ?? date,
    kind: source?.kind ?? "lesson",
    themeId,
    memo: "",
    nextStep: "",
    youtubeUrls: [],
    attachmentIds: [],
    ...(source ? { source: { kind: source.kind, id: source.record.id } } : {}),
  };
}
export async function saveTheme(theme: LearningTheme) {
  if (!theme.title.trim() || theme.title.trim().length > 200)
    throw new Error("テーマ名を1〜200文字で入力してください。");
  if (!["active", "paused", "completed"].includes(theme.status))
    throw new Error("テーマの状態を選んでください。");
  await db.transaction("rw", db.tables, async () => {
    for (const id of theme.eventIds)
      if (!(await db.events.get(id)))
        throw new Error("関連するイベントが見つかりません。");
    for (const id of theme.goalIds)
      if (!(await db.goals.get(id)))
        throw new Error("関連する技術目標が見つかりません。");
    const old = await db.themes.get(theme.id);
    const now = new Date().toISOString();
    await db.themes.put({
      ...theme,
      title: theme.title.trim(),
      category: theme.category.trim(),
      updatedAt: now,
      nextStepUpdatedAt:
        !old || old.nextStep !== theme.nextStep ? now : old.nextStepUpdatedAt,
    });
  });
}
export async function saveLearningNote(
  note: LearningNote,
  files: File[] = [],
  removed: string[] = [],
) {
  const kept = await db.attachments
    .where("[relatedType+relatedId]")
    .equals(["learning", note.id])
    .filter((item) => !removed.includes(item.id))
    .count();
  if (
    !note.memo.trim() &&
    !note.nextStep.trim() &&
    !note.youtubeUrls.some((url) => url.trim()) &&
    !files.length &&
    !kept
  )
    throw new Error("ひと言のメモか、画像・動画・YouTubeを残してください。");
  await save("learningNotes", note, files, removed);
}
export function nextStepFor(theme: LearningTheme, notes: LearningNote[]) {
  return (
    [...notes]
      .filter(
        (note) =>
          note.themeId === theme.id &&
          note.nextStep.trim() &&
          (!theme.nextStepUpdatedAt ||
            note.createdAt >= theme.nextStepUpdatedAt),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      )[0]?.nextStep || theme.nextStep
  );
}
export async function learningOverview(today: string) {
  const [themes, notes, events, agenda] = await Promise.all([
    allThemes(),
    allLearningNotes(),
    db.events
      .where("date")
      .aboveOrEqual(today)
      .filter(
        (event) => event.status === "planned" || event.status === "active",
      )
      .toArray(),
    agendaBetween(today, today),
  ]);
  return {
    themes,
    notes,
    events,
    agenda,
    eventWork: eventWorkForToday(events, today),
  };
}
export async function sourceNotes(source: {
  kind: "lesson" | "practice";
  id: string;
}) {
  return db.learningNotes
    .where("[source.kind+source.id]")
    .equals([source.kind, source.id])
    .toArray();
}
// Link old records only through goals explicitly chosen for the theme.
export async function themeHistory(theme: LearningTheme) {
  const [notes, lessons, practices] = await Promise.all([
    db.learningNotes.where("themeId").equals(theme.id).toArray(),
    db.lessons.toArray(),
    db.practiceLogs.toArray(),
  ]);
  const linkedLessons = lessons.filter(
    (lesson) =>
      lesson.completed &&
      !lesson.cancelled &&
      (lesson.themeIds?.includes(theme.id) ||
        [
          ...lesson.relatedGoalIds,
          ...lesson.actualTopics.flatMap((topic) =>
            topic.goalId ? [topic.goalId] : [],
          ),
          ...lesson.plannedTopics.flatMap((topic) =>
            topic.goalId ? [topic.goalId] : [],
          ),
        ].some((id) => theme.goalIds.includes(id))),
  );
  const linkedPractices = practices.filter(
    (practice) =>
      (practice.status ?? "recorded") === "recorded" &&
      (practice.themeIds?.includes(theme.id) ||
        practice.goalIds.some((id) => theme.goalIds.includes(id))),
  );
  return {
    notes: notes.sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
    legacy: [
      ...linkedLessons.map((record) => ({
        item: { kind: "lesson" as const, record },
        text: [
          record.teacherFeedback,
          lessonHomework(record),
          ...record.actualTopics.map((topic) => topic.title),
        ]
          .filter(Boolean)
          .join("\n"),
      })),
      ...linkedPractices.map((record) => ({
        item: { kind: "practice" as const, record },
        text: [record.whatWentWell, record.whatNeedsImprovement, record.note]
          .filter(Boolean)
          .join("\n"),
      })),
    ].sort((a, b) => b.item.record.date.localeCompare(a.item.record.date)),
  };
}
