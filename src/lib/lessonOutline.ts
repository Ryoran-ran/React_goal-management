export interface LessonOutlineItem {
  kind: "item" | "paragraph";
  text: string;
  details: string[];
}

const bulletPattern =
  /^[・•●][ \t\u3000]*|^[-*][ \t\u3000]+|^[0-9０-９]+[.．、)）][ \t\u3000]+/;

// Keep the source text in storage; derive the outline without rewriting user input.
export function parseLessonOutline(source: string): LessonOutlineItem[] {
  const result: LessonOutlineItem[] = [];
  const lines = source.split(/\r\n|\n|\r/);
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    const previous = result.at(-1);
    if (/^[ \t\u3000]/.test(line) && previous?.kind === "item") {
      previous.details.push(text);
      continue;
    }
    const bullet = bulletPattern.exec(line);
    if (bullet) {
      const title = line.slice(bullet[0].length).trim();
      if (title) result.push({ kind: "item", text: title, details: [] });
    } else {
      result.push({ kind: "item", text, details: [] });
    }
  }
  return result;
}
