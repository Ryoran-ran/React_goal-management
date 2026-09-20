import type { GoalCategory, LessonSection } from "../types";
import { goalCategories } from "./goalCategories";

type Category = Pick<LessonSection, "category" | "customCategory">;
export function newLessonSection(): LessonSection {
  return {
    id: crypto.randomUUID(),
    category: "custom",
    customCategory: "",
    content: "",
    feedback: "",
    homework: "",
    youtubeUrls: [],
  };
}
export const cleanCategoryName = (name: string) =>
  name.trim().replace(/\s+/g, " ");
export const categoryNameKey = (name: string) =>
  cleanCategoryName(name).normalize("NFKC").toLocaleLowerCase("ja");
export function lessonCategoryLabel(section: Category): string {
  return section.category === "custom"
    ? cleanCategoryName(section.customCategory ?? "")
    : (goalCategories[section.category] ?? "");
}
export function lessonCategoryKey(section: Category): string {
  return categoryNameKey(lessonCategoryLabel(section));
}
export function namedLessonCategory(name: string): Category {
  const preset = Object.entries(goalCategories).find(
    ([, label]) => categoryNameKey(label) === categoryNameKey(name),
  );
  return preset
    ? { category: preset[0] as GoalCategory }
    : { category: "custom", customCategory: cleanCategoryName(name) };
}
export function lessonCategoryValue(section: Category): string {
  if (!lessonCategoryLabel(section)) return "";
  return section.category === "custom"
    ? `custom:${section.customCategory}`
    : section.category;
}
export function lessonCategoryFromValue(value: string): Category {
  if (!value) return { category: "custom", customCategory: "" };
  return value.startsWith("custom:")
    ? namedLessonCategory(value.slice(7))
    : { category: value as GoalCategory, customCategory: undefined };
}
