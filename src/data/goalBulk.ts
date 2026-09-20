import type { GoalCategory } from "../types";
import type { GoalImportRow } from "../lib/goalBulk";
import { goalCategories, goalCategory } from "../lib/goalCategories";
import { db } from "./db";
import { base, save } from "./repository";

export async function saveGoalsBulk(rows: GoalImportRow[]) {
  if (!rows.length) throw new Error("登録する目標を1件以上選んでください。");
  if (rows.length > 200)
    throw new Error("一度に登録できる目標は200件までです。");
  for (const row of rows) {
    if (!row.category || !Object.hasOwn(goalCategories, row.category))
      throw new Error("各目標のカテゴリを選んでください。");
    if (!["high", "medium", "low"].includes(row.priority))
      throw new Error("優先度は低・中・高から選んでください。");
    if (!row.title.trim() || row.title.trim().length > 200)
      throw new Error("目標名は1〜200文字で入力してください。");
  }
  return db.transaction("rw", db.tables, async () => {
    const key = (title: string, category: GoalCategory) =>
      JSON.stringify([category, title.trim()]);
    const existing = new Set(
      (await db.goals.toArray()).map((goal) =>
        key(goal.title, goalCategory(goal)),
      ),
    );
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const category = row.category!;
      const id = key(row.title, category);
      if (existing.has(id)) {
        skipped++;
        continue;
      }
      await save("goals", {
        ...base(),
        title: row.title.trim(),
        description: row.description.trim(),
        successCriteria: row.successCriteria.trim(),
        category,
        priority: row.priority,
        status: "not_started",
        progress: 0,
        eventIds: [],
      });
      existing.add(id);
      created++;
    }
    return { created, skipped };
  });
}
