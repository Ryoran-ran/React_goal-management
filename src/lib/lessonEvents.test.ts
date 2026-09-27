import { describe, expect, it } from "vitest";
import type { Lesson } from "../types";
import {
  indexLessonSectionEvents,
  prepareLessonSectionEvents,
} from "./lessonEvents";

const lesson = (): Lesson => ({
  id: "lesson",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  date: "2026-09-20",
  relatedEventIds: ["legacy-event"],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  completed: true,
  sections: [
    {
      id: "rumba",
      category: "rumba",
      content: "",
      feedback: "",
      homework: "",
      youtubeUrls: [],
    },
    {
      id: "waltz",
      category: "waltz",
      content: "",
      feedback: "",
      homework: "",
      youtubeUrls: [],
      relatedEventIds: ["section-event"],
    },
  ],
});

describe("lesson event links by content section", () => {
  it("migrates lesson-wide links onto each existing section", () => {
    const migrated = prepareLessonSectionEvents(lesson());
    expect(migrated.sectionEventLinks).toBe(true);
    expect(
      migrated.sections?.map((section) => section.relatedEventIds),
    ).toEqual([["legacy-event"], ["section-event", "legacy-event"]]);
  });

  it("rebuilds the lesson-wide index after a section link is removed", () => {
    const migrated = prepareLessonSectionEvents(lesson());
    const changed = {
      ...migrated,
      sections: migrated.sections?.map((section) => ({
        ...section,
        relatedEventIds: section.relatedEventIds?.filter(
          (id) => id !== "legacy-event",
        ),
      })),
    };
    expect(indexLessonSectionEvents(changed).relatedEventIds).toEqual([
      "section-event",
    ]);
  });

  it("preserves a legacy link until the lesson has a content section", () => {
    const input = { ...lesson(), sections: undefined };
    expect(indexLessonSectionEvents(input)).toEqual(input);
  });
});
