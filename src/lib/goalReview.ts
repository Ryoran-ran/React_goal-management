import type { Goal, Priority } from "../types";
import { matchesGoalCategory, type GoalCategoryFilter } from "./goalCategories";

export const priorities = { high: "高", medium: "中", low: "低" };
export const goalStatuses = {
  not_started: "未着手",
  in_progress: "取り組み中",
  achieved: "達成",
  paused: "保留",
};
export type GoalStatusFilter = "all" | "unfinished" | Goal["status"];
export interface GoalFilters {
  category: GoalCategoryFilter;
  priority: "all" | Priority;
  status: GoalStatusFilter;
  search: string;
}
export function reviewGoals(goals: Goal[], filters: GoalFilters) {
  const words = filters.search
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return goals
    .filter((goal) => {
      const text = [goal.title, goal.successCriteria, goal.description]
        .filter(Boolean)
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase();
      return (
        matchesGoalCategory(goal, filters.category) &&
        (filters.priority === "all" || goal.priority === filters.priority) &&
        (filters.status === "all" ||
          (filters.status === "unfinished"
            ? goal.status !== "achieved"
            : goal.status === filters.status)) &&
        words.every((word) => text.includes(word))
      );
    })
    .sort(
      (a, b) =>
        ["high", "medium", "low"].indexOf(a.priority) -
          ["high", "medium", "low"].indexOf(b.priority) ||
        a.title.localeCompare(b.title, "ja"),
    );
}
