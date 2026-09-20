import type { Goal, GoalCategory } from "../types";

export const goalCategories: Record<GoalCategory, string> = {
  general: "全体",
  latin: "ラテン",
  standard: "モダン",
  cha_cha: "チャチャチャ",
  samba: "サンバ",
  rumba: "ルンバ",
  paso_doble: "パソドブレ",
  jive: "ジャイブ",
  waltz: "ワルツ",
  tango: "タンゴ",
  viennese_waltz: "ヴェニーズワルツ",
  slow_foxtrot: "スローフォックストロット",
  quickstep: "クイックステップ",
};
export const latinCategories: GoalCategory[] = [
  "cha_cha",
  "samba",
  "rumba",
  "paso_doble",
  "jive",
];
export const standardCategories: GoalCategory[] = [
  "waltz",
  "tango",
  "viennese_waltz",
  "slow_foxtrot",
  "quickstep",
];
export type GoalCategoryFilter = "all" | GoalCategory;
export function goalCategory(goal: Pick<Goal, "category">): GoalCategory {
  return goal.category ?? "general";
}
export function matchesGoalCategory(
  goal: Pick<Goal, "category">,
  filter: GoalCategoryFilter,
) {
  const category = goalCategory(goal);
  return (
    filter === "all" ||
    category === filter ||
    (filter === "latin" && latinCategories.includes(category)) ||
    (filter === "standard" && standardCategories.includes(category))
  );
}
export function goalLabel(goal: Pick<Goal, "title" | "category">) {
  return `${goalCategories[goalCategory(goal)]} · ${goal.title}`;
}
export function goalOptions(goals: Goal[]) {
  return goals.map((goal) => ({ id: goal.id, title: goalLabel(goal) }));
}
