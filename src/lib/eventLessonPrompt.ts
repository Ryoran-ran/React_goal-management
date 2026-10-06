import type { JournalEntry } from "../data/learningJournal";

export interface EventLessonPromptRecord {
  date: string;
  lesson: string;
  category: string;
  notes: { label: string; content: string }[];
}

export function eventLessonPromptRecords(
  entries: JournalEntry[],
  eventId: string,
): EventLessonPromptRecord[] {
  return entries
    .filter(
      (entry) =>
        entry.target.type === "schedule" &&
        entry.target.item.kind === "lesson" &&
        entry.relatedEventIds.includes(eventId),
    )
    .map((entry) => ({
      date: entry.date,
      lesson: entry.title,
      category: entry.category || "全体",
      notes: entry.fields
        .filter((field) => field.text.trim())
        .map((field) => ({ label: field.label, content: field.text.trim() })),
    }))
    .filter((record) => record.notes.length > 0)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.lesson.localeCompare(b.lesson, "ja") ||
        a.category.localeCompare(b.category, "ja"),
    );
}
