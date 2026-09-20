import type { Lesson } from "../types";
import { lessonCategoryLabel } from "./lessonCategories";

export function youtubeLink(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    const host = url.hostname.toLowerCase();
    let id: string | null | undefined;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
      ].includes(host)
    ) {
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : /^\/(shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[2];
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const result = new URL("https://www.youtube.com/watch");
    result.searchParams.set("v", id);
    const time = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (time && /^(?:\d+h)?(?:\d+m)?\d+s?$/.test(time))
      result.searchParams.set("t", time);
    return result.toString();
  } catch {
    return;
  }
}
export function lessonHomework(lesson?: Lesson): string {
  if (!lesson) return "";
  return [
    lesson.homework,
    ...(lesson.sections ?? [])
      .filter((section) => section.homework.trim())
      .map((section) => `${lessonCategoryLabel(section)}：${section.homework}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}
