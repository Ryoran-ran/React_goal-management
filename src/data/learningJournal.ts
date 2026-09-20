import { db } from "./db";
import type { AgendaItem } from "./practiceAgenda";
import type { LearningNote } from "../types";
import { categoryNameKey, lessonCategoryLabel } from "../lib/lessonCategories";

export interface JournalEntry {
  id: string;
  date: string;
  createdAt: string;
  title: string;
  category: string;
  themeIds: string[];
  kind: LearningNote["kind"];
  fields: { label: string; text: string }[];
  attachmentCount: number;
  youtubeCount: number;
  target:
    | { type: "note"; note: LearningNote }
    | { type: "schedule"; item: AgendaItem; sectionId?: string };
}

// Read the original records so edits and deletions are reflected without migration or copies.
export async function learningJournal(): Promise<JournalEntry[]> {
  const [notes, themes, lessons, practices, attachments] = await Promise.all([
    db.learningNotes.toArray(),
    db.themes.toArray(),
    db.lessons.toArray(),
    db.practiceLogs.toArray(),
    db.attachments.toArray(),
  ]);
  const linkedThemes = (goalIds: string[]) =>
    themes
      .filter((theme) => theme.goalIds.some((id) => goalIds.includes(id)))
      .map((theme) => theme.id);
  const mediaCount = (
    kind: "lesson" | "practice",
    id: string,
    sectionId?: string,
  ) =>
    attachments.filter(
      (file) =>
        file.relatedType === kind &&
        file.relatedId === id &&
        file.sectionId === sectionId,
    ).length;
  const entries: JournalEntry[] = notes.map((note) => ({
    id: `note:${note.id}`,
    date: note.date,
    createdAt: note.createdAt,
    title:
      themes.find((theme) => theme.id === note.themeId)?.title ?? "学びのメモ",
    category: themes.find((theme) => theme.id === note.themeId)?.category ?? "",
    themeIds: note.themeId ? [note.themeId] : [],
    kind: note.kind,
    fields: [
      { label: "メモ", text: note.memo },
      { label: "次に試すこと", text: note.nextStep },
    ],
    attachmentCount: note.attachmentIds.length,
    youtubeCount: note.youtubeUrls.filter((url) => url.trim()).length,
    target: { type: "note", note },
  }));
  for (const lesson of lessons) {
    if (lesson.cancelled) continue;
    const item: AgendaItem = { kind: "lesson", record: lesson };
    const common = {
      date: lesson.date,
      createdAt: lesson.createdAt,
      title: lesson.title || "レッスン",
      kind: "lesson" as const,
      themeIds: [
        ...new Set([
          ...(lesson.themeIds ?? []),
          ...linkedThemes([
            ...lesson.relatedGoalIds,
            ...lesson.actualTopics.flatMap((topic) =>
              topic.goalId ? [topic.goalId] : [],
            ),
          ]),
        ]),
      ],
    };
    for (const section of lesson.sections ?? []) {
      const fields = [
        { label: "取り組んだ内容", text: section.content },
        { label: "先生からの指摘・アドバイス", text: section.feedback },
        { label: "次回までの宿題", text: section.homework },
      ];
      const attachmentCount = mediaCount("lesson", lesson.id, section.id);
      const youtubeCount = section.youtubeUrls.filter((url) =>
        url.trim(),
      ).length;
      if (
        !fields.some((field) => field.text.trim()) &&
        !attachmentCount &&
        !youtubeCount
      )
        continue;
      entries.push({
        ...common,
        id: `lesson:${lesson.id}:${section.id}`,
        category: lessonCategoryLabel(section),
        fields,
        attachmentCount,
        youtubeCount,
        target: { type: "schedule", item, sectionId: section.id },
      });
    }
    const fields = [
      {
        label: "取り組んだ内容",
        text: lesson.actualTopics.map((topic) => topic.title).join("\n"),
      },
      {
        label: "先生からの指摘・アドバイス",
        text: lesson.teacherFeedback ?? "",
      },
      { label: "次回までの宿題", text: lesson.homework ?? "" },
      { label: "気づいた課題", text: lesson.newIssues ?? "" },
    ];
    const attachmentCount = mediaCount("lesson", lesson.id);
    if (fields.some((field) => field.text.trim()) || attachmentCount)
      entries.push({
        ...common,
        id: `lesson:${lesson.id}:general`,
        category: "",
        fields,
        attachmentCount,
        youtubeCount: 0,
        target: { type: "schedule", item },
      });
  }
  for (const practice of practices) {
    if ((practice.status ?? "recorded") !== "recorded") continue;
    const fields = [
      { label: "メモ", text: practice.note ?? "" },
      { label: "うまくできたこと", text: practice.whatWentWell ?? "" },
      { label: "改善したいこと", text: practice.whatNeedsImprovement ?? "" },
    ];
    const attachmentCount = mediaCount("practice", practice.id);
    if (!fields.some((field) => field.text.trim()) && !attachmentCount)
      continue;
    entries.push({
      id: `practice:${practice.id}`,
      date: practice.date,
      createdAt: practice.createdAt,
      title: practice.title || "自主練習",
      kind: "practice",
      category: "",
      themeIds: [
        ...new Set([
          ...(practice.themeIds ?? []),
          ...linkedThemes(practice.goalIds),
        ]),
      ],
      fields,
      attachmentCount,
      youtubeCount: 0,
      target: {
        type: "schedule",
        item: { kind: "practice", record: practice },
      },
    });
  }
  return entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function filterJournal(
  entries: JournalEntry[],
  category: string,
  themeId: string,
  keyword: string,
) {
  const query = categoryNameKey(keyword);
  return entries.filter(
    (entry) =>
      (category === "all" ||
        (category === "unassigned"
          ? !entry.category
          : categoryNameKey(entry.category) === category)) &&
      (themeId === "all" ||
        (themeId === "unassigned"
          ? !entry.themeIds.length
          : entry.themeIds.includes(themeId))) &&
      categoryNameKey(
        [
          entry.date,
          entry.title,
          entry.category,
          ...entry.fields.map((field) => field.text),
        ].join(" "),
      ).includes(query),
  );
}
