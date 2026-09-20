import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, initialize, save } from "./repository";
import { retireTechnicalGoals } from "./retireGoals";
import { newTheme, themeHistory } from "./learning";
import { learningJournal } from "./learningJournal";
import {
  createBackup,
  readBackup,
  restoreBackup,
  backupCounts,
} from "./backup";

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

async function legacyData() {
  const goal = {
    ...base(),
    title: "体重移動",
    status: "in_progress" as const,
    priority: "high" as const,
    progress: 50,
    eventIds: [],
  };
  await save("goals", goal, [
    new File(["goal media"], "goal.png", { type: "image/png" }),
  ]);
  const theme = { ...newTheme(), title: "ルンバ", goalIds: [goal.id] };
  await db.themes.put(theme);
  const lesson = {
    ...base(),
    date: "2026-09-20",
    title: "個人レッスン",
    relatedEventIds: [],
    relatedGoalIds: [goal.id],
    plannedTopics: [],
    actualTopics: [
      {
        id: "topic",
        title: "足の使い方",
        priority: "high" as const,
        goalId: goal.id,
      },
    ],
    completed: true,
    attachmentIds: [],
    homework: "ゆっくり練習",
  };
  await save("lessons", lesson, [
    new File(["lesson media"], "lesson.mp4", { type: "video/mp4" }),
  ]);
  const practice = {
    ...base(),
    date: "2026-09-19",
    goalIds: [goal.id],
    practiced: true,
    note: "できたこと",
    attachmentIds: [],
  };
  await save("practiceLogs", practice);
  const weekly = {
    ...base(),
    startDate: "2026-09-14",
    endDate: "2026-09-20",
    focusGoalIds: [goal.id],
    focusDetails: { [goal.id]: "急がず待つ" },
    review: "週のメモ",
    tasks: [
      { id: "task", title: "基礎練習", goalIds: [goal.id], completed: true },
    ],
  };
  await save("weeklyPlans", weekly);
  const monthly = {
    ...base(),
    year: 2026,
    month: 9,
    focusGoalIds: [goal.id],
    focusDetails: { [goal.id]: "足元を確認" },
    notes: "月のメモ",
    objectives: [
      {
        id: "objective",
        title: "音楽で踊る",
        goalId: goal.id,
        progress: 75,
        completed: false,
      },
    ],
  };
  await save("monthlyPlans", monthly);
  const event = {
    ...base(),
    date: "2026-10-25",
    title: "大会",
    type: "competition" as const,
    status: "planned" as const,
    goalIds: [goal.id],
  };
  await save("events", event);
  return { goal, theme, lesson, practice, weekly, monthly, event };
}

describe("technical goal retirement", () => {
  it("deletes goals and only their media while retaining lessons, plans, themes and explicit history links", async () => {
    const data = await legacyData();
    const lessonBefore = (await db.lessons.get(data.lesson.id))!;
    await initialize();
    expect(await db.goals.count()).toBe(0);
    expect(await db.attachments.count()).toBe(1);
    expect(await db.attachmentFiles.count()).toBe(1);
    expect(
      await (await db.attachmentFiles.get(
        lessonBefore.attachmentIds[0],
      ))!.blob.text(),
    ).toBe("lesson media");
    const lesson = (await db.lessons.get(data.lesson.id))!;
    expect(lesson.homework).toBe("ゆっくり練習");
    expect(lesson.actualTopics[0]).toMatchObject({
      title: "足の使い方",
      priority: "high",
    });
    expect(lesson.actualTopics[0].goalId).toBeUndefined();
    expect(lesson.relatedGoalIds).toEqual([]);
    expect(lesson.themeIds).toEqual([data.theme.id]);
    expect(lesson.updatedAt).toBe(lessonBefore.updatedAt);
    expect((await db.events.get(data.event.id))?.goalIds).toEqual([]);
    expect((await db.practiceLogs.get(data.practice.id))?.note).toBe(
      "できたこと",
    );
    const theme = (await db.themes.get(data.theme.id))!;
    expect(theme.goalIds).toEqual([]);
    expect((await themeHistory(theme)).legacy).toHaveLength(2);
    expect(
      (await learningJournal()).every((entry) =>
        entry.themeIds.includes(theme.id),
      ),
    ).toBe(true);
    expect(await db.weeklyPlans.get(data.weekly.id)).toMatchObject({
      review: "週のメモ\n\n体重移動\n急がず待つ",
      focusGoalIds: [],
      tasks: [{ title: "基礎練習", completed: true, goalIds: [] }],
    });
    expect(await db.monthlyPlans.get(data.monthly.id)).toMatchObject({
      notes: "月のメモ\n\n体重移動\n足元を確認",
      focusGoalIds: [],
      objectives: [{ title: "音楽で踊る", progress: 75 }],
    });
    await initialize();
    await retireTechnicalGoals(true);
    expect((await db.weeklyPlans.get(data.weekly.id))?.review).toBe(
      "週のメモ\n\n体重移動\n急がず待つ",
    );
    expect(await db.themes.count()).toBe(1);
  });

  it("does not resurrect goals from old backups, including ones with the retirement marker", async () => {
    await initialize();
    const data = await legacyData();
    const backup = await readBackup(await createBackup());
    expect(
      backupCounts(backup.tables).find((row) => row.name === "attachments")
        ?.count,
    ).toBe(1);
    await restoreBackup(backup);
    expect(await db.goals.count()).toBe(0);
    expect(await db.attachments.count()).toBe(1);
    expect((await db.themes.get(data.theme.id))?.goalIds).toEqual([]);
    expect((await db.lessons.get(data.lesson.id))?.themeIds).toEqual([
      data.theme.id,
    ]);
    expect(await db.lessons.count()).toBe(1);
  });

  it("rolls back deletion and relationship changes together if the migration fails", async () => {
    const data = await legacyData();
    const fail = () => {
      throw new Error("storage failure");
    };
    db.settings.hook("creating", fail);
    try {
      await expect(retireTechnicalGoals()).rejects.toThrow("storage failure");
    } finally {
      db.settings.hook("creating").unsubscribe(fail);
    }
    expect(await db.goals.count()).toBe(1);
    expect(await db.attachmentFiles.count()).toBe(2);
    expect((await db.lessons.get(data.lesson.id))?.relatedGoalIds).toEqual([
      data.goal.id,
    ]);
    expect((await db.themes.get(data.theme.id))?.goalIds).toEqual([
      data.goal.id,
    ]);
    expect((await db.weeklyPlans.get(data.weekly.id))?.review).toBe("週のメモ");
  });
});
