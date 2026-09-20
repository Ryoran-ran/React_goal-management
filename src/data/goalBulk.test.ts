import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseGoalTable } from "../lib/goalBulk";
import { saveGoalsBulk } from "./goalBulk";
import { db } from "./db";

const table = `| 技術目標 | カテゴリ | 優先度 | 達成条件 | メモ |
| --- | --- | --- | --- | --- |
| **体重移動** | 全体 | 高 | 重心が乗ってから次へ進む | 急いでしまう |
| ボディアクション | ルンバ | 中 | | 胴体から動く |
| 再現性 | | 低 | | |`;
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const store of db.tables) await store.clear();
  });
});
afterAll(() => db.delete());
describe("bulk goal import", () => {
  it("maps the five standard columns to the editor fields without saving", async () => {
    const rows = parseGoalTable(table);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      title: "体重移動",
      category: "general",
      priority: "high",
      successCriteria: "重心が乗ってから次へ進む",
      description: "急いでしまう",
    });
    expect(rows[1].category).toBe("rumba");
    expect(rows[2]).toEqual({
      title: "再現性",
      category: undefined,
      priority: "low",
      successCriteria: "",
      description: "",
    });
    expect(await db.goals.count()).toBe(0);
  });
  it("preserves trailing empty TSV columns and rejects the old order and star priorities", () => {
    const [row] = parseGoalTable(
      "技術目標\tカテゴリ\t優先度\t達成条件\tメモ\n姿勢\t全体\t中\t\t",
    );
    expect(row.description).toBe("");
    expect(row.successCriteria).toBe("");
    expect(() => parseGoalTable("高\t姿勢\tメモ")).toThrow("5列");
    expect(() => parseGoalTable("姿勢\t全体\t★★★\t\t")).toThrow("低・中・高");
    expect(() => parseGoalTable("姿勢\t不明\t高\t\t")).toThrow("カテゴリ");
  });
  it("requires categories, saves criteria and notes separately, and skips duplicates", async () => {
    const parsed = parseGoalTable(table);
    await expect(saveGoalsBulk(parsed)).rejects.toThrow("カテゴリ");
    expect(await db.goals.count()).toBe(0);
    const rows = parsed.map((row) => ({
      ...row,
      category: row.category ?? ("general" as const),
    }));
    expect(await saveGoalsBulk(rows)).toEqual({ created: 3, skipped: 0 });
    expect(
      await saveGoalsBulk(rows.map((row) => ({ ...row, description: "変更" }))),
    ).toEqual({ created: 0, skipped: 3 });
    const stored = await db.goals
      .filter((goal) => goal.title === rows[0].title)
      .first();
    expect(stored?.description).toBe(rows[0].description);
    expect(stored?.successCriteria).toBe(rows[0].successCriteria);
    expect(stored?.status).toBe("not_started");
    expect(stored?.progress).toBe(0);
    expect(
      await saveGoalsBulk([{ ...rows[0], category: "rumba", priority: "low" }]),
    ).toEqual({ created: 1, skipped: 0 });
    expect(await db.goals.count()).toBe(4);
  });
  it("does not save a partial batch when a later row is invalid", async () => {
    const rows = parseGoalTable(table).map((row) => ({
      ...row,
      category: "general" as const,
    }));
    rows[2].title = "";
    await expect(saveGoalsBulk(rows)).rejects.toThrow("目標名");
    expect(await db.goals.count()).toBe(0);
  });
});
