export interface LessonOutlineItem {
  kind: "item" | "paragraph";
  text: string;
  details: string[];
}

// Keep the source text in storage; derive the outline without rewriting user input.
export function parseLessonOutline(source: string): LessonOutlineItem[] {
  const result: LessonOutlineItem[] = [];
  for (const line of source.split(/\r\n|\n|\r/)) {
    const text = line.trim();
    if (!text) continue;
    const previous = result.at(-1);
    if (/^[ \t\u3000]/.test(line) && previous?.kind === "item") {
      previous.details.push(text);
      continue;
    }
    const bullet =
      /^[・•●][ \t\u3000]*|^[-*][ \t\u3000]+|^[0-9０-９]+[.．、)）][ \t\u3000]+/.exec(
        line,
      );
    if (bullet) {
      const title = line.slice(bullet[0].length).trim();
      if (title) result.push({ kind: "item", text: title, details: [] });
    } else if (previous?.kind === "item") {
      // A wrapped line belongs to the current item even without indentation.
      previous.details.push(text);
    } else if (previous) {
      previous.text += `\n${text}`;
    } else {
      result.push({ kind: "paragraph", text, details: [] });
    }
  }
  return result;
}
