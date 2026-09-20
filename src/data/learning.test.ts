import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DanceDatabase, db } from "./db";
import {
  attachmentBlob,
  attachmentsFor,
  base,
  initialize,
  remove,
  save,
  watch,
} from "./repository";
import {
  allLearningNotes,
  learningOverview,
  newLearningNote,
  newTheme,
  nextStepFor,
  saveLearningNote,
  saveTheme,
  sourceNotes,
  themeHistory,
} from "./learning";
import type { Goal, Lesson, PracticeLog } from "../types";

const theme = () => ({
  ...newTheme(),
  title: "ルンバの下半身",
  category: "ルンバ",
  destination: "床から動きを伝える",
  nextStep: "先生の言葉を残す",
});
const lesson = (): Lesson => ({
  ...base(),
  date: "2026-09-20",
  title: "個人レッスン",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  completed: false,
  homework: "以前の宿題",
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

describe("theme learning workflow", () => {
  it("starts without preselected themes and removes retired technical goals", async () => {
    const goal: Goal = {
      ...base(),
      title: "体重移動",
      category: "rumba",
      status: "in_progress",
      priority: "high",
      progress: 25,
      eventIds: [],
    };
    await save("goals", goal);
    await initialize();
    expect(await db.themes.count()).toBe(0);
    expect(await db.goals.get(goal.id)).toBeUndefined();
    await expect(saveTheme(newTheme())).rejects.toThrow("テーマ名");
  });
  it("keeps unclassified, video-only notes and assigns them later without losing media", async () => {
    const note = newLearningNote("2026-09-20");
    await saveLearningNote(note, [
      new File(["clip"], "rumba.mp4", { type: "video/mp4" }),
    ]);
    const saved = (await db.learningNotes.get(note.id))!;
    expect(saved.themeId).toBeUndefined();
    const media = await attachmentsFor("learning", note.id);
    expect(await (await attachmentBlob(media[0].id))?.text()).toBe("clip");
    const focus = theme();
    await saveTheme(focus);
    await saveLearningNote({
      ...saved,
      themeId: focus.id,
      memo: "先生の説明を録画",
    });
    expect((await themeHistory(focus)).notes.map((item) => item.id)).toEqual([
      note.id,
    ]);
    expect(await db.attachmentFiles.count()).toBe(1);
    db.close();
    await db.open();
    expect((await db.learningNotes.get(note.id))?.themeId).toBe(focus.id);
    await remove("learningNotes", note.id);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentFiles.count()).toBe(0);
  });
  it("records a scheduled lesson atomically while retaining its earlier content and files", async () => {
    const source = lesson();
    await save("lessons", source, [
      new File(["photo"], "old.png", { type: "image/png" }),
    ]);
    const note = {
      ...newLearningNote(source.date, undefined, {
        kind: "lesson",
        record: source,
      }),
      memo: "アンディオールについて教わった",
    };
    await saveLearningNote(note);
    const stored = (await db.lessons.get(source.id))!;
    expect(stored.completed).toBe(true);
    expect(stored.homework).toBe("以前の宿題");
    expect(stored.attachmentIds).toHaveLength(1);
    expect((await sourceNotes({ kind: "lesson", id: source.id }))[0].id).toBe(
      note.id,
    );
    await remove("lessons", source.id);
    expect((await db.learningNotes.get(note.id))?.source).toBeUndefined();
    expect((await db.learningNotes.get(note.id))?.memo).toBe(note.memo);
  });
  it("rolls back source completion and new media when writing the note fails", async () => {
    const source = lesson();
    await save("lessons", source);
    const note = {
      ...newLearningNote(source.date, undefined, {
        kind: "lesson",
        record: source,
      }),
      memo: "記録",
    };
    const fail = () => {
      throw new Error("disk failure");
    };
    db.learningNotes.hook("creating", fail);
    try {
      await expect(
        saveLearningNote(note, [
          new File(["clip"], "clip.mp4", { type: "video/mp4" }),
        ]),
      ).rejects.toThrow("disk failure");
    } finally {
      db.learningNotes.hook("creating").unsubscribe(fail);
    }
    expect((await db.lessons.get(source.id))?.completed).toBe(false);
    expect(await db.learningNotes.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentFiles.count()).toBe(0);
  });
  it("rejects empty notes, invalid themes, links and cancelled sources", async () => {
    await expect(
      saveLearningNote(newLearningNote("2026-09-20")),
    ).rejects.toThrow("ひと言");
    await expect(
      saveLearningNote({
        ...newLearningNote("2026-09-20", "missing"),
        memo: "メモ",
      }),
    ).rejects.toThrow("テーマ");
    await expect(
      saveLearningNote({
        ...newLearningNote("2026-09-20"),
        youtubeUrls: ["https://example.com"],
      }),
    ).rejects.toThrow("YouTube");
    const source = { ...lesson(), cancelled: true };
    await save("lessons", source);
    await expect(
      saveLearningNote({
        ...newLearningNote(source.date, undefined, {
          kind: "lesson",
          record: source,
        }),
        memo: "メモ",
      }),
    ).rejects.toThrow("中止");
    expect(await db.learningNotes.count()).toBe(0);
  });
  it("allows editing saved learning without undoing a later schedule cancellation", async () => {
    const source = lesson();
    await save("lessons", source);
    const note = {
      ...newLearningNote(source.date, undefined, {
        kind: "lesson" as const,
        record: source,
      }),
      memo: "残しておく学び",
    };
    await saveLearningNote(note);
    await save("lessons", { ...source, cancelled: true, completed: false });
    await saveLearningNote({ ...note, memo: "追記した学び" });
    expect((await db.lessons.get(source.id))?.cancelled).toBe(true);
    expect((await db.lessons.get(source.id))?.completed).toBe(false);
    expect((await db.learningNotes.get(note.id))?.memo).toBe("追記した学び");
  });
  it("keeps current next steps when a note has none and respects dates and manual updates", () => {
    const focus = { ...theme(), nextStepUpdatedAt: "2026-09-20T00:00:00.000Z" };
    const older = {
      ...newLearningNote("2026-09-20", focus.id),
      createdAt: "2026-09-20T01:00:00.000Z",
      nextStep: "太ももを確認",
    };
    const newer = {
      ...newLearningNote("2026-09-22", focus.id),
      createdAt: "2026-09-22T01:00:00.000Z",
      nextStep: "ゆっくり試す",
    };
    const memo = {
      ...newLearningNote("2026-09-23", focus.id),
      memo: "難しかった",
    };
    expect(nextStepFor(focus, [memo, older, newer])).toBe("ゆっくり試す");
    expect(nextStepFor(focus, [older, memo])).toBe("太ももを確認");
    expect(
      nextStepFor(
        {
          ...focus,
          nextStep: "新しい方針",
          nextStepUpdatedAt: "2026-09-24T00:00:00.000Z",
        },
        [older, newer],
      ),
    ).toBe("新しい方針");
  });
  it("groups earlier records only under explicitly linked goals and retains history when paused", async () => {
    const goal: Goal = {
      ...base(),
      title: "アンディオール",
      category: "rumba",
      status: "in_progress",
      priority: "high",
      progress: 0,
      eventIds: [],
    };
    await save("goals", goal);
    const focus = { ...theme(), goalIds: [goal.id] };
    await saveTheme(focus);
    const source = { ...lesson(), completed: true, relatedGoalIds: [goal.id] };
    await save("lessons", source);
    const other = { ...lesson(), completed: true };
    await save("lessons", other);
    const practice: PracticeLog = {
      ...base(),
      date: "2026-09-19",
      status: "recorded",
      practiced: true,
      goalIds: [goal.id],
      attachmentIds: [],
      note: "試した",
    };
    await save("practiceLogs", practice);
    await saveLearningNote({
      ...newLearningNote("2026-09-20", focus.id),
      memo: "新しい記録",
    });
    await saveTheme({ ...focus, status: "paused" });
    expect(
      (await themeHistory(focus)).legacy.map((item) => item.item.record.id),
    ).toEqual([source.id, practice.id]);
    expect((await themeHistory(focus)).notes).toHaveLength(1);
    await remove("goals", goal.id);
    expect((await db.themes.get(focus.id))?.goalIds).toEqual([]);
    expect((await db.learningNotes.toArray())[0].themeId).toBe(focus.id);
  });
  it("keeps overview read-only and orders the timeline across repeated practices", async () => {
    await saveLearningNote({
      ...newLearningNote("2026-09-22"),
      memo: "後の記録",
    });
    await saveLearningNote({
      ...newLearningNote("2026-09-20"),
      kind: "practice",
      memo: "先の記録",
    });
    await saveLearningNote({
      ...newLearningNote("2026-09-20"),
      kind: "practice",
      memo: "同じ日の別の練習",
    });
    expect((await allLearningNotes())[0].memo).toBe("後の記録");
    await new Promise<void>((resolve, reject) => {
      const subscription = watch(
        () => learningOverview("2026-09-20"),
        (data) => {
          try {
            expect(data.notes).toHaveLength(3);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            subscription.unsubscribe();
          }
        },
        reject,
      );
    });
  });
  it("upgrades a version 2 database without rewriting goals, notes, blobs or recurring schedules", async () => {
    const name = `learning-upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({
      events: "id, date, *goalIds",
      goals: "id, status, *eventIds",
      monthlyPlans: "id, &[year+month]",
      weeklyPlans: "id, &startDate",
      practiceLogs: "id, &date",
      lessons: "id, date, originalDate, seriesId, *relatedGoalIds",
      attachments: "id, [relatedType+relatedId]",
      attachmentFiles: "id",
      settings: "id",
    });
    const record = lesson();
    await old.table("lessons").put(record);
    await old
      .table("attachmentFiles")
      .put({ id: "blob", blob: new Blob(["video"], { type: "video/mp4" }) });
    await old.table("settings").put({
      id: "ongoing-lesson-series:existing",
      value: { seriesId: "existing" },
    });
    old.close();
    const upgraded = new DanceDatabase(name);
    try {
      expect(await upgraded.lessons.get(record.id)).toEqual(record);
      expect(
        await (await upgraded.attachmentFiles.get("blob"))?.blob.text(),
      ).toBe("video");
      expect(
        (await upgraded.settings.get("ongoing-lesson-series:existing"))?.value,
      ).toEqual({ seriesId: "existing" });
      expect(await upgraded.themes.count()).toBe(0);
      expect(await upgraded.learningNotes.count()).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
});
