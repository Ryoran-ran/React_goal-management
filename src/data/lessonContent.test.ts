import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  attachmentBlob,
  attachmentsFor,
  base,
  previousLesson,
  remove,
  save,
} from "./repository";
import { createLessonSchedule, saveLessonOccurrence } from "./lessonSchedule";
import {
  deleteLessonSeries,
  listLessonSeries,
  saveSeriesChange,
} from "./lessonSeries";
import { lessonHomework, youtubeLink } from "../lib/lessonContent";
import type { Lesson, LessonSection } from "../types";
import { customLessonCategories } from "./lessonCategories";
import {
  lessonCategoryFromValue,
  lessonCategoryLabel,
  lessonCategoryValue,
  namedLessonCategory,
  newLessonSection,
} from "../lib/lessonCategories";

const sections = (): LessonSection[] => [
  {
    id: "paso",
    category: "paso_doble",
    content: "アペル",
    feedback: "上体を保つ",
    homework: "ゆっくり確認",
    youtubeUrls: ["https://youtu.be/abcdefghijk?t=30"],
  },
  {
    id: "rumba",
    category: "rumba",
    content: "ウォーク",
    feedback: "乗り切る",
    homework: "体重移動",
    youtubeUrls: [],
  },
];
const lesson = (): Lesson => ({
  ...base(),
  date: "2026-09-20",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  completed: true,
  sections: sections(),
});
const file = (type: string) => new File(["media"], "lesson", { type });

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("category lesson records and media", () => {
  it("keeps content and media in a new draft until its category is chosen", async () => {
    const draft = newLessonSection();
    const nextDraft = newLessonSection();
    expect(nextDraft.id).not.toBe(draft.id);
    expect(lessonCategoryValue(draft)).toBe("");
    const input = {
      ...lesson(),
      sections: [
        {
          ...draft,
          content: "レッスン後に思い出したこと",
          homework: "ゆっくり復習",
        },
      ],
    };
    const video = file("video/mp4");
    await expect(
      save("lessons", input, [video], [], [draft.id]),
    ).rejects.toThrow("カテゴリ名");
    expect(await db.lessons.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    input.sections[0] = {
      ...input.sections[0],
      ...namedLessonCategory("身体づくり"),
    };
    await save("lessons", input, [video], [], [draft.id]);
    const stored = (await db.lessons.get(input.id))!.sections![0];
    expect(stored).toMatchObject({
      id: draft.id,
      customCategory: "身体づくり",
      content: "レッスン後に思い出したこと",
      homework: "ゆっくり復習",
    });
    expect((await attachmentsFor("lesson", input.id))[0].sectionId).toBe(
      draft.id,
    );
    expect(await customLessonCategories()).toEqual(["身体づくり"]);
    expect(lessonCategoryFromValue("")).toEqual({
      category: "custom",
      customCategory: "",
    });
  });
  it("saves multiple custom categories with media and reuses them after reopening", async () => {
    const input = lesson();
    input.sections = [
      { ...sections()[0], ...namedLessonCategory("  ストレッチ  ") },
      { ...sections()[1], ...namedLessonCategory("サルサ") },
    ];
    expect(await customLessonCategories()).toEqual([]);
    await saveLessonOccurrence(input, [file("video/mp4")], [], "one", input, [
      "paso",
    ]);
    db.close();
    await db.open();
    expect(await customLessonCategories()).toEqual(["ストレッチ", "サルサ"]);
    const stored = (await db.lessons.get(input.id))!;
    expect(stored.sections?.map(lessonCategoryLabel)).toEqual([
      "ストレッチ",
      "サルサ",
    ]);
    expect(lessonHomework(stored)).toBe(
      "ストレッチ：ゆっくり確認\n\nサルサ：体重移動",
    );
    expect((await attachmentsFor("lesson", input.id))[0].sectionId).toBe(
      "paso",
    );
    const next = lesson();
    next.sections = [
      {
        ...sections()[0],
        ...lessonCategoryFromValue(lessonCategoryValue(stored.sections![0])),
      },
    ];
    await save("lessons", next);
    expect(await customLessonCategories()).toEqual(["ストレッチ", "サルサ"]);
    await remove("lessons", input.id);
    expect((await db.lessons.get(next.id))?.sections?.[0].customCategory).toBe(
      "ストレッチ",
    );
    expect(await customLessonCategories()).toEqual(["ストレッチ", "サルサ"]);
  });

  it("rejects invalid and duplicate names, reuses presets and does not remember failed saves", async () => {
    const input = lesson();
    for (const name of ["  ", "あ".repeat(81)]) {
      await expect(
        save("lessons", {
          ...input,
          sections: [
            { ...sections()[0], category: "custom", customCategory: name },
          ],
        }),
      ).rejects.toThrow("カテゴリ名");
    }
    await expect(
      save("lessons", {
        ...input,
        sections: [
          { ...sections()[0], ...namedLessonCategory("サルサ") },
          { ...sections()[1], ...namedLessonCategory(" サルサ ") },
        ],
      }),
    ).rejects.toThrow("重複");
    expect(namedLessonCategory(" ルンバ ")).toEqual({ category: "rumba" });
    await expect(
      save("lessons", {
        ...input,
        relatedEventIds: ["missing"],
        sections: [{ ...sections()[0], ...namedLessonCategory("ストレッチ") }],
      }),
    ).rejects.toThrow("関連イベント");
    expect(await customLessonCategories()).toEqual([]);
    expect(await db.lessons.count()).toBe(0);
  });

  it("persists separate notes, videos, images and YouTube links through the occurrence save flow", async () => {
    const input = lesson();
    await saveLessonOccurrence(
      input,
      [
        file("video/mp4"),
        file("image/png"),
        file("video/quicktime"),
        file("video/webm"),
      ],
      [],
      "one",
      input,
      ["paso", "rumba", "paso", undefined],
    );
    db.close();
    await db.open();
    const stored = await db.lessons.get(input.id);
    expect(stored?.sections).toEqual(input.sections);
    const attachments = await attachmentsFor("lesson", input.id);
    expect(attachments).toHaveLength(4);
    expect(stored?.attachmentIds.sort()).toEqual(
      attachments.map((a) => a.id).sort(),
    );
    expect(attachments.find((a) => a.mimeType === "image/png")?.sectionId).toBe(
      "rumba",
    );
    for (const attachment of attachments) {
      const blob = await attachmentBlob(attachment.id);
      expect(blob?.type).toBe(attachment.mimeType);
      expect(await blob?.text()).toBe("media");
    }
    expect(lessonHomework(await previousLesson("2026-09-21", "next"))).toBe(
      "パソドブレ：ゆっくり確認\n\nルンバ：体重移動",
    );
  });

  it("removes only the deleted category's media and retains legacy notes and general images", async () => {
    const input = {
      ...lesson(),
      homework: "全体の宿題",
      teacherFeedback: "以前の指摘",
    };
    await save(
      "lessons",
      input,
      [file("video/mp4"), file("image/png"), file("image/jpeg")],
      [],
      ["paso", "rumba", undefined],
    );
    const before = await attachmentsFor("lesson", input.id);
    await save("lessons", {
      ...input,
      sections: input.sections!.filter((s) => s.id !== "paso"),
    });
    const after = await attachmentsFor("lesson", input.id);
    expect(after.map((a) => a.id).sort()).toEqual(
      before
        .filter((a) => a.sectionId !== "paso")
        .map((a) => a.id)
        .sort(),
    );
    expect(
      await attachmentBlob(before.find((a) => a.sectionId === "paso")!.id),
    ).toBeUndefined();
    const stored = await db.lessons.get(input.id);
    expect(stored?.teacherFeedback).toBe("以前の指摘");
    expect(lessonHomework(stored)).toBe("全体の宿題\n\nルンバ：体重移動");
    await remove("lessons", input.id);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentFiles.count()).toBe(0);
  });

  it("rejects invalid or duplicate categories, bad links and wrong media targets without changing saved data", async () => {
    const input = lesson();
    await save("lessons", input, [file("video/mp4")], [], ["paso"]);
    const attachments = await attachmentsFor("lesson", input.id);
    await expect(
      save(
        "lessons",
        {
          ...input,
          sections: [
            {
              ...sections()[0],
              youtubeUrls: ["https://example.com/watch?v=abcdefghijk"],
            },
          ],
        },
        [],
        attachments.map((a) => a.id),
      ),
    ).rejects.toThrow("YouTube");
    await expect(
      save("lessons", {
        ...input,
        sections: [sections()[0], { ...sections()[0], id: "duplicate" }],
      }),
    ).rejects.toThrow("重複");
    await expect(
      save("lessons", input, [file("video/mp4")], [], ["missing"]),
    ).rejects.toThrow("登録先");
    await expect(save("lessons", input, [file("text/html")])).rejects.toThrow(
      "画像",
    );
    expect((await db.lessons.get(input.id))?.sections).toEqual(input.sections);
    expect(await db.attachments.count()).toBe(1);
    expect(await db.attachmentFiles.count()).toBe(1);
  });

  it("preserves category-only records when changing and deleting a recurring series", async () => {
    await createLessonSchedule({
      title: "定期レッスン",
      startDate: "2026-09-21",
      endDate: "2026-10-12",
      weekdays: [1],
      excludedDates: [],
    });
    const series = (await listLessonSeries())[0];
    const [first, second] = await db.lessons.orderBy("date").toArray();
    await save("lessons", { ...first, sections: sections() });
    await save("lessons", {
      ...second,
      sections: [{ ...sections()[0], content: "", feedback: "", homework: "" }],
    });
    await saveSeriesChange(
      series.seriesId,
      {
        from: "2026-09-21",
        title: "変更",
        weekdays: [2],
        endDate: "2026-10-12",
        stop: false,
      },
      0,
      "2026-09-20",
    );
    expect((await db.lessons.get(first.id))?.sections).toEqual(sections());
    const updated = (await listLessonSeries())[0];
    await deleteLessonSeries(
      series.seriesId,
      updated.revision ?? 0,
      "2026-09-20",
    );
    expect(await db.lessons.count()).toBe(2);
    expect(
      (await db.lessons.get(second.id))?.sections?.[0].youtubeUrls,
    ).toEqual(sections()[0].youtubeUrls);
    expect((await db.lessons.get(first.id))?.seriesId).toBeUndefined();
  });
});

describe("YouTube link handling", () => {
  it("accepts watch, share, shorts and embed video links and preserves start time", () => {
    const canonical = "https://www.youtube.com/watch?v=abcdefghijk";
    expect(youtubeLink("https://youtu.be/abcdefghijk?si=tracking&t=30")).toBe(
      canonical + "&t=30",
    );
    expect(youtubeLink("https://www.youtube.com/shorts/abcdefghijk")).toBe(
      canonical,
    );
    expect(
      youtubeLink("https://www.youtube.com/embed/abcdefghijk?start=60"),
    ).toBe(canonical + "&t=60");
    expect(youtubeLink(canonical)).toBe(canonical);
  });
  it("rejects unsafe or non-video URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://youtube.com.evil.test/watch?v=abcdefghijk",
      "https://www.youtube.com/playlist?list=abcdefghijk",
      "https://youtu.be/short",
      "",
    ])
      expect(youtubeLink(url)).toBeUndefined();
    expect(lessonHomework()).toBe("");
  });
});
