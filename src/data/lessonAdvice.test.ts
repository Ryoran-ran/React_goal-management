import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { learningJournal } from "./learningJournal";
import {
  adviceRecords,
  groupAdviceRecords,
  selectedAdviceRecords,
  lessonAdvicePrompt,
} from "../lib/lessonAdvice";
import type { Lesson } from "../types";

const lesson = (
  id: string,
  date: string,
  changes: Partial<Lesson> = {},
): Lesson => ({
  id,
  date,
  createdAt: `${date}T10:00:00Z`,
  updatedAt: `${date}T10:00:00Z`,
  title: "個人レッスン",
  completed: true,
  plannedTopics: [],
  actualTopics: [],
  relatedEventIds: [],
  relatedGoalIds: [],
  attachmentIds: [],
  teacherFeedback: "身体から動く",
  ...changes,
});
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterAll(() => db.close());

describe("AI相談用のレッスン記録", () => {
  it("同じレッスンのカテゴリと全体メモをまとめ、同日の別レッスンは別に選択できる", async () => {
    await db.lessons.bulkAdd([
      lesson("one", "2026-09-10", {
        teacherFeedback: "除外する全体メモ",
        sections: [
          {
            id: "rumba",
            category: "rumba",
            content: "除外するルンバ",
            feedback: "",
            homework: "",
            youtubeUrls: [],
          },
          {
            id: "samba",
            category: "samba",
            content: "除外するサンバ",
            feedback: "",
            homework: "",
            youtubeUrls: [],
          },
        ],
      }),
      lesson("two", "2026-09-10", { teacherFeedback: "残す指摘" }),
    ]);
    const records = adviceRecords(
      await learningJournal(),
      "2026-09-01",
      "2026-09-20",
    );
    const groups = groupAdviceRecords(records);
    expect(groups).toHaveLength(2);
    expect(groups[0].records).toHaveLength(3);
    expect(groups[0].categories).toEqual(
      expect.arrayContaining(["ルンバ", "サンバ", "全体・未分類"]),
    );
    expect(selectedAdviceRecords(groups, new Set())).toHaveLength(4);
    const selected = selectedAdviceRecords(groups, new Set(["lesson:one"]));
    expect(selected).toHaveLength(1);
    const prompt = lessonAdvicePrompt(
      selected,
      "2026-09-01",
      "2026-09-20",
      "相談",
    );
    expect(prompt).toContain("残す指摘");
    expect(prompt).not.toContain("除外する");
    const cleared = selectedAdviceRecords(
      groups,
      new Set(groups.map((group) => group.id)),
    );
    expect(cleared).toEqual([]);
    expect(
      lessonAdvicePrompt(cleared, "2026-09-01", "2026-09-20", "相談"),
    ).toBe("");
    expect(selectedAdviceRecords(groups, new Set())).toHaveLength(4);
  });

  it("個別に残したレッスンの学びのメモは独立して選択できる", async () => {
    await db.lessons.add(lesson("one", "2026-09-10"));
    await db.learningNotes.add({
      id: "memo",
      date: "2026-09-10",
      createdAt: "",
      updatedAt: "",
      kind: "lesson",
      memo: "別の気づき",
      nextStep: "",
      youtubeUrls: [],
      attachmentIds: [],
    });
    const groups = groupAdviceRecords(
      adviceRecords(await learningJournal(), "2026-09-01", "2026-09-20"),
    );
    expect(groups).toHaveLength(2);
    expect(
      selectedAdviceRecords(groups, new Set(["note:memo"])).map(
        (record) => record.id,
      ),
    ).toEqual(["lesson:one:general"]);
  });

  it("大会当日の振り返りを任意で添え、通常の相談には大会の分析を要求しない", async () => {
    await db.lessons.add(lesson("one", "2026-09-10"));
    const records = adviceRecords(
      await learningJournal(),
      "2026-09-01",
      "2026-09-20",
    );
    const reflection =
      "9月20日の大会\n体重移動を意識したが、後半は急いでしまった";
    const prompt = lessonAdvicePrompt(
      records,
      "2026-09-01",
      "2026-09-20",
      "次の練習を考えたい",
      reflection,
    );
    expect(prompt).toContain(reflection);
    expect(prompt).toContain("順位だけで成否を判断せず");
    expect(prompt).toContain("大会後のレッスン");
    expect(
      lessonAdvicePrompt(records, "2026-09-01", "2026-09-20", "相談", " \n "),
    ).not.toContain("【大会当日の振り返り");
    expect(await db.lessons.count()).toBe(1);
    expect(await db.events.count()).toBe(0);
  });

  it("開始日と終了日を含み、古い順に並べ、中止・空の予定・自主練習を除外する", async () => {
    await db.lessons.bulkAdd([
      lesson("last", "2026-09-20"),
      lesson("first", "2026-09-01"),
      lesson("before", "2026-08-31"),
      lesson("after", "2026-09-21"),
      lesson("cancelled", "2026-09-10", { cancelled: true }),
      lesson("empty", "2026-09-10", {
        completed: false,
        teacherFeedback: "",
        plannedTopics: [
          { id: "p", title: "まだ実施していない", priority: "high" },
        ],
      }),
    ]);
    await db.practiceLogs.add({
      id: "practice",
      date: "2026-09-10",
      createdAt: "",
      updatedAt: "",
      goalIds: [],
      practiced: true,
      note: "自主練習",
      attachmentIds: [],
    });
    const records = adviceRecords(
      await learningJournal(),
      "2026-09-01",
      "2026-09-20",
    );
    expect(records.map((record) => record.id)).toEqual([
      "lesson:first:general",
      "lesson:last:general",
    ]);
    expect(await db.lessons.count()).toBe(6);
  });

  it("カテゴリ別の内容・指摘・宿題・URLと全体メモを改変せず含める", async () => {
    await db.lessons.add(
      lesson("one", "2026-09-10", {
        sections: [
          {
            id: "section",
            category: "custom",
            customCategory: "基礎",
            content: "体重移動\nゆっくり確認",
            feedback: "先に進みすぎない",
            homework: "教わった動きを復習",
            youtubeUrls: ["https://youtu.be/example"],
          },
        ],
      }),
    );
    await db.attachments.add({
      id: "video",
      name: "video.mp4",
      mimeType: "video/mp4",
      size: 123,
      relatedType: "lesson",
      relatedId: "one",
      sectionId: "section",
      createdAt: "",
    });
    const records = adviceRecords(
      await learningJournal(),
      "2026-09-01",
      "2026-09-20",
    );
    const prompt = lessonAdvicePrompt(
      records,
      "2026-09-01",
      "2026-09-20",
      "  次に何を意識すれば良いですか？  ",
    );
    expect(prompt).toContain("次に何を意識すれば良いですか？");
    const payload = JSON.parse(prompt.split("【レッスン記録：JSON】\n")[1]);
    expect(payload).toHaveLength(2);
    const section = payload.find(
      (item: { カテゴリ: string }) => item.カテゴリ === "基礎",
    );
    expect(section.記録.map((field: { 内容: string }) => field.内容)).toEqual([
      "体重移動\nゆっくり確認",
      "先に進みすぎない",
      "教わった動きを復習",
    ]);
    expect(section.YouTubeリンク).toEqual(["https://youtu.be/example"]);
    expect(section.添付画像動画の件数).toBe(1);
    expect(prompt).toContain("添付ファイルの実体は含まれていません");
    expect(prompt).not.toContain("video.mp4");
  });

  it("レッスンとして残した学びのメモも含め、振り返りメモは除外する", async () => {
    const note = {
      id: "note",
      date: "2026-09-10",
      createdAt: "",
      updatedAt: "",
      kind: "lesson" as const,
      memo: "先生からの助言",
      nextStep: "次回確認",
      youtubeUrls: [],
      attachmentIds: [],
    };
    await db.learningNotes.bulkAdd([
      note,
      { ...note, id: "reflection", kind: "reflection" },
    ]);
    const records = adviceRecords(
      await learningJournal(),
      "2026-09-01",
      "2026-09-20",
    );
    expect(records.map((record) => record.id)).toEqual(["note:note"]);
  });

  it("期間が未入力・逆順、相談が空欄、記録ゼロの場合はプロンプトを作らない", async () => {
    await db.lessons.add(lesson("one", "2026-09-10"));
    const entries = await learningJournal();
    expect(adviceRecords(entries, "", "2026-09-20")).toEqual([]);
    expect(adviceRecords(entries, "2026-09-20", "2026-09-01")).toEqual([]);
    expect(
      lessonAdvicePrompt(entries, "2026-09-01", "2026-09-20", " \n "),
    ).toBe("");
    expect(lessonAdvicePrompt([], "2026-09-01", "2026-09-20", "相談")).toBe("");
  });
});
