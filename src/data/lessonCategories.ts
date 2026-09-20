import { db } from "./db";
export const lessonCategoriesSetting = "lesson-custom-categories";
export async function customLessonCategories(): Promise<string[]> {
  const setting = await db.settings.get(lessonCategoriesSetting);
  return Array.isArray(setting?.value)
    ? setting.value.filter((name): name is string => typeof name === "string")
    : [];
}
