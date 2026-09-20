import "fake-indexeddb/auto";
import { liveQuery } from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, remove, save } from "./repository";
import { newLearningNote, newTheme, saveLearningNote } from "./learning";
import { filterJournal, learningJournal } from "./learningJournal";
import { openAgendaItem } from "../lib/practiceNavigation";
import type { Lesson, LessonSection, PracticeLog } from "../types";

const section = (fields: Partial<LessonSection> = {}): LessonSection => ({
  id: crypto.randomUUID(),
  category: "rumba",
  content: "",
  feedback: "",
  homework: "",
  youtubeUrls: [],
  ...fields,
});
const lesson = (fields: Partial<Lesson> = {}): Lesson => ({
  ...base(),
  date: "2026-09-20",
  title: "個人レッスン",
  completed: false,
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  ...fields,
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("combined learning journal", () => {
  it("shows saved lesson categories individually and opens their original sections", async () => {
    const rumba = section({
      content: "下半身の使い方",
      feedback: "太もものアンディオール",
      homework: "ゆっくり復習",
    });
    const custom = section({
      category: "custom",
      customCategory: "身体づくり",
      feedback: "軸を確認",
    });
    const source = lesson({
      sections: [rumba, custom, section({ category: "samba" })],
    });
    await save("lessons", source);
    const entries = await learningJournal();
    expect(entries).toHaveLength(2);
    const entry = entries.find((entry) => entry.category === "ルンバ")!;
    expect(entry.fields.map((field) => field.text)).toEqual([
      rumba.content,
      rumba.feedback,
      rumba.homework,
    ]);
    expect(entry.title).toBe(source.title);
    expect(entry.date).toBe(source.date);
    if (entry.target.type !== "schedule")
      throw new Error("Expected original schedule");
    expect(
      openAgendaItem(entry.target.item, "2026-09-20", entry.target.sectionId),
    ).toMatchObject({
      type: "edit",
      exists: true,
      sectionId: rumba.id,
      item: { record: { id: source.id } },
    });
    expect(await db.learningNotes.count()).toBe(0);
  });

  it("keeps file-only and YouTube-only categories without repeating files in the general record", async () => {
    const video = section();
    const youtube = section({
      category: "paso_doble",
      youtubeUrls: ["https://youtu.be/dQw4w9WgXcQ"],
    });
    const source = lesson({ sections: [video, youtube] });
    await save(
      "lessons",
      source,
      [new File(["video"], "lesson.mp4", { type: "video/mp4" })],
      [],
      [video.id],
    );
    const entries = await learningJournal();
    expect(entries).toHaveLength(2);
    expect(
      entries.find((entry) => entry.category === "ルンバ")?.attachmentCount,
    ).toBe(1);
    expect(
      entries.find((entry) => entry.category === "パソドブレ")?.youtubeCount,
    ).toBe(1);
    expect(await db.attachmentFiles.count()).toBe(1);
  });

  it("combines notes, general lesson content and practice records by date, excluding empty and cancelled schedules", async () => {
    const note = { ...newLearningNote("2026-09-21"), memo: "振り返り" };
    await saveLearningNote(note);
    await save("lessons", lesson({ teacherFeedback: "肩を下げる" }));
    await save("lessons", lesson({ completed: true }));
    await save(
      "lessons",
      lesson({
        plannedTopics: [
          { id: "planned", title: "先生に聞くこと", priority: "high" },
        ],
      }),
    );
    await save(
      "lessons",
      lesson({ cancelled: true, sections: [section({ content: "中止" })] }),
    );
    const practice: PracticeLog = {
      ...base(),
      date: "2026-09-19",
      practiced: true,
      goalIds: [],
      attachmentIds: [],
      note: "復習できた",
    };
    await save("practiceLogs", practice);
    await save("practiceLogs", {
      ...practice,
      ...base(),
      date: "2026-09-22",
      status: "planned",
      note: "予定",
    });
    await save("practiceLogs", {
      ...practice,
      ...base(),
      date: "2026-09-23",
      status: "cancelled",
    });
    expect(
      (await learningJournal()).map((entry) => [entry.date, entry.kind]),
    ).toEqual([
      ["2026-09-21", "lesson"],
      ["2026-09-20", "lesson"],
      ["2026-09-19", "practice"],
    ]);
  });

  it("does not create a second empty card for a schedule completed through a learning note", async () => {
    const source = lesson();
    await save("lessons", source);
    await saveLearningNote({
      ...newLearningNote(source.date, undefined, {
        kind: "lesson",
        record: source,
      }),
      memo: "先生の説明",
    });
    expect((await db.lessons.get(source.id))?.completed).toBe(true);
    expect(await learningJournal()).toHaveLength(1);
  });

  it("filters category, homework and explicitly linked themes without guessing from the category name", async () => {
    const focus = {
      ...newTheme(),
      title: "ルンバのテーマ",
      category: "ルンバ",
      goalIds: ["goal"],
    };
    await db.themes.put(focus);
    await db.lessons.put(
      lesson({
        relatedGoalIds: ["goal"],
        sections: [section({ homework: "ABCを復習" })],
      }),
    );
    await db.lessons.put(
      lesson({ sections: [section({ content: "別のメモ" })] }),
    );
    const entries = await learningJournal();
    expect(filterJournal(entries, "ルンバ", focus.id, "ａｂｃ")).toHaveLength(
      1,
    );
    expect(filterJournal(entries, "ルンバ", "unassigned", "")).toHaveLength(1);
    expect(filterJournal(entries, "サンバ", "all", "")).toHaveLength(0);
  });

  it("reacts to original edits and deletions in liveQuery without write transactions or copied records", async () => {
    const part = section({ content: "最初の内容" });
    const source = lesson({ sections: [part] });
    await save("lessons", source);
    await new Promise<void>((resolve, reject) => {
      let stage = 0;
      const subscription = liveQuery(learningJournal).subscribe({
        next(entries) {
          try {
            if (stage === 0) {
              expect(entries[0].fields[0].text).toBe("最初の内容");
              stage = 1;
              void save("lessons", {
                ...source,
                sections: [{ ...part, content: "更新した内容" }],
              }).catch(reject);
            } else if (stage === 1) {
              expect(entries[0].fields[0].text).toBe("更新した内容");
              stage = 2;
              void remove("lessons", source.id).catch(reject);
            } else {
              expect(entries).toHaveLength(0);
              subscription.unsubscribe();
              resolve();
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: reject,
      });
    });
    expect(await db.learningNotes.count()).toBe(0);
  });
});
