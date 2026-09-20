import type { GoalCategory, Priority } from "../types";
import { goalCategories } from "./goalCategories";

export interface GoalImportRow {
  title: string;
  description: string;
  successCriteria: string;
  priority: Priority;
  category?: GoalCategory;
}
const priorities: Record<string, Priority> = {
  高: "high",
  中: "medium",
  低: "low",
};
export const goalImportColumns = [
  "技術目標",
  "カテゴリ",
  "優先度",
  "達成条件",
  "メモ",
];
export const goalImportTemplate =
  "| 技術目標 | カテゴリ | 優先度 | 達成条件 | メモ |\n| --- | --- | --- | --- | --- |\n| 目標名 | 全体 | 高 | 達成を判断する条件 | 指摘・補足 |";
function clean(cell: string) {
  return cell
    .trim()
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/\\\|/g, "|");
}
export function parseGoalTable(text: string): GoalImportRow[] {
  const rows: GoalImportRow[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (
      raw.includes("\t")
        ? raw.split("\t")
        : line
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split(/(?<!\\)\|/)
    ).map(clean);
    if (cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s/g, ""))))
      continue;
    if (
      cells.length === 5 &&
      cells.every((cell, i) => cell === goalImportColumns[i])
    )
      continue;
    if (cells.length !== 5)
      throw new Error(
        `${index + 1}行目は「技術目標・カテゴリ・優先度・達成条件・メモ」の5列にしてください。空欄の列も省略しないでください。`,
      );
    const priority = Object.hasOwn(priorities, cells[2])
      ? priorities[cells[2]]
      : undefined;
    if (!priority)
      throw new Error(
        `${index + 1}行目の優先度は「低・中・高」のいずれかにしてください。`,
      );
    if (!cells[0] || cells[0].length > 200)
      throw new Error(
        `${index + 1}行目の技術目標は1〜200文字で入力してください。`,
      );
    const category = Object.entries(goalCategories).find(
      ([, label]) => label === cells[1],
    )?.[0] as GoalCategory | undefined;
    if (cells[1] && !category)
      throw new Error(
        `${index + 1}行目のカテゴリ「${cells[1]}」を確認してください。`,
      );
    rows.push({
      title: cells[0],
      category,
      priority,
      successCriteria: cells[3],
      description: cells[4],
    });
  }
  if (!rows.length) throw new Error("登録する目標の表を貼り付けてください。");
  if (rows.length > 200)
    throw new Error("一度に登録できる目標は200件までです。");
  return rows;
}
