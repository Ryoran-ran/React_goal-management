import type { Lesson } from "../types";

const unique = (ids: string[]) => [...new Set(ids)];

/** Moves legacy lesson-wide links onto every existing content section once. */
export function prepareLessonSectionEvents(lesson: Lesson): Lesson {
  if (lesson.sectionEventLinks || !lesson.sections?.length) return lesson;
  const legacyIds = unique(lesson.relatedEventIds);
  return {
    ...lesson,
    sectionEventLinks: true,
    sections: lesson.sections.map((section) => {
      const relatedEventIds = unique([
        ...(section.relatedEventIds ?? []),
        ...legacyIds,
      ]);
      return relatedEventIds.length || section.relatedEventIds !== undefined
        ? { ...section, relatedEventIds }
        : section;
    }),
  };
}

/** Keeps the legacy lesson index in sync for existing queries and exports. */
export function indexLessonSectionEvents(lesson: Lesson): Lesson {
  const prepared = prepareLessonSectionEvents(lesson);
  if (!prepared.sectionEventLinks) return prepared;
  return {
    ...prepared,
    relatedEventIds: unique(
      (prepared.sections ?? []).flatMap(
        (section) => section.relatedEventIds ?? [],
      ),
    ),
  };
}
