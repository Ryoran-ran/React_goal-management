import { goalCategories } from "../lib/goalCategories";
import { validateMilestones } from "../lib/milestones";

export const backupTables = [
  "events",
  "goals",
  "monthlyPlans",
  "weeklyPlans",
  "practiceLogs",
  "lessons",
  "attachments",
  "settings",
  "themes",
  "learningNotes",
] as const;
export type BackupTable = (typeof backupTables)[number];
export type BackupRows = Record<BackupTable, Record<string, unknown>[]>;
type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === "string";
const id: Check = (value) => typeof value === "string" && value.length > 0;
const boolean: Check = (value) => typeof value === "boolean";
const number: Check = (value) =>
  typeof value === "number" && Number.isFinite(value);
const natural: Check = (value) =>
  number(value) && Number.isSafeInteger(value) && (value as number) >= 0;
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const array =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const oneOf =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value);
const date: Check = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const timestamp: Check = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
export const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    object(value) &&
    Object.entries(fields).every(([key, check]) => check(value[key]));
const ids = array(id);
const strings = array(text);
const base = { id, createdAt: timestamp, updatedAt: timestamp };
const category = oneOf(...Object.keys(goalCategories));
const priority = oneOf("high", "medium", "low");
const topic = shape({
  id,
  title: text,
  priority,
  goalId: optional(id),
  completed: optional(boolean),
});
const section = shape({
  id,
  category: oneOf(...Object.keys(goalCategories), "custom"),
  customCategory: optional(text),
  content: text,
  feedback: text,
  homework: text,
  youtubeUrls: strings,
});
const details: Check = (value) =>
  object(value) && Object.values(value).every(text);
const checks: Record<BackupTable, Check> = {
  events: shape({
    ...base,
    title: text,
    type: oneOf("competition", "medal_test", "performance", "demo", "other"),
    date,
    description: optional(text),
    status: oneOf("planned", "active", "completed", "cancelled"),
    goalIds: ids,
    milestones: optional((value) => {
      try {
        validateMilestones(value);
        return true;
      } catch {
        return false;
      }
    }),
  }),
  goals: shape({
    ...base,
    title: text,
    category: optional(category),
    description: optional(text),
    status: oneOf("not_started", "in_progress", "achieved", "paused"),
    priority,
    progress: number,
    eventIds: ids,
    parentGoalId: optional(id),
    targetDate: optional(date),
    successCriteria: optional(text),
  }),
  monthlyPlans: shape({
    ...base,
    year: natural,
    month: (value) =>
      natural(value) && (value as number) >= 1 && (value as number) <= 12,
    focusGoalIds: ids,
    focusDetails: optional(details),
    objectives: array(
      shape({
        id,
        title: text,
        goalId: optional(id),
        successCriteria: optional(text),
        progress: number,
        completed: boolean,
      }),
    ),
    lessonTargetCount: optional(natural),
    notes: optional(text),
  }),
  weeklyPlans: shape({
    ...base,
    startDate: date,
    endDate: date,
    focusGoalIds: ids,
    focusDetails: optional(details),
    tasks: array(shape({ id, title: text, goalIds: ids, completed: boolean })),
    review: optional(text),
  }),
  practiceLogs: shape({
    themeIds: optional(ids),
    ...base,
    date,
    title: optional(text),
    status: optional(oneOf("planned", "recorded", "cancelled")),
    plannedNote: optional(text),
    durationMinutes: optional(number),
    goalIds: ids,
    practiced: boolean,
    whatWentWell: optional(text),
    whatNeedsImprovement: optional(text),
    note: optional(text),
    attachmentIds: ids,
  }),
  lessons: shape({
    themeIds: optional(ids),
    ...base,
    date,
    title: optional(text),
    durationMinutes: optional(number),
    relatedEventIds: ids,
    relatedGoalIds: ids,
    plannedTopics: array(topic),
    actualTopics: array(topic),
    sections: optional(array(section)),
    teacherFeedback: optional(text),
    homework: optional(text),
    newIssues: optional(text),
    attachmentIds: ids,
    completed: boolean,
    cancelled: optional(boolean),
    cancellationReason: optional(text),
    seriesId: optional(id),
    originalDate: optional(date),
    seriesDate: optional(date),
  }),
  attachments: shape({
    id,
    name: text,
    mimeType: oneOf(
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ),
    size: natural,
    relatedType: oneOf("lesson", "practice", "event", "goal", "learning"),
    relatedId: id,
    sectionId: optional(id),
    createdAt: timestamp,
  }),
  settings: shape({ id, value: (value) => value !== undefined }),
  themes: shape({
    ...base,
    title: text,
    category: text,
    destination: text,
    nextStep: text,
    nextStepUpdatedAt: optional(timestamp),
    status: oneOf("active", "paused", "completed"),
    eventIds: ids,
    goalIds: ids,
  }),
  learningNotes: shape({
    ...base,
    date,
    kind: oneOf("lesson", "practice", "reflection"),
    themeId: optional(id),
    memo: text,
    nextStep: text,
    youtubeUrls: strings,
    attachmentIds: ids,
    source: optional(shape({ kind: oneOf("lesson", "practice"), id })),
  }),
};
const weekday: Check = (value) => natural(value) && (value as number) <= 6;
const series = shape({
  seriesId: id,
  generatedThrough: date,
  revision: optional(natural),
  stoppedFrom: optional(date),
  schedule: shape({
    title: text,
    startDate: date,
    endDate: optional((value) => value === "" || date(value)),
    weekdays: array(weekday),
    durationMinutes: optional(number),
    excludedDates: array(date),
  }),
  shifts: array(
    shape({
      from: date,
      weekday,
      delta: (value) => number(value) && Number.isSafeInteger(value),
    }),
  ),
});

export function validateBackupRows(
  value: unknown,
): asserts value is BackupRows {
  if (!object(value) || Object.keys(value).length !== backupTables.length)
    throw new Error("バックアップのデータ構成が正しくありません。");
  for (const name of backupTables) {
    const rows = value[name];
    if (!Array.isArray(rows) || !rows.every(checks[name]))
      throw new Error(`バックアップの ${name} に不正な項目があります。`);
    const keys = new Set<string>();
    const unique = new Set<string>();
    for (const row of rows as Record<string, unknown>[]) {
      const key = row.id as string;
      if (keys.has(key))
        throw new Error(`バックアップの ${name} に重複があります。`);
      keys.add(key);
      const uniqueKey =
        name === "practiceLogs"
          ? row.date
          : name === "weeklyPlans"
            ? row.startDate
            : name === "monthlyPlans"
              ? `${row.year}-${row.month}`
              : key;
      if (unique.has(String(uniqueKey)))
        throw new Error(
          `バックアップの ${name} の日付・期間が重複しています。`,
        );
      unique.add(String(uniqueKey));
      if (
        name === "lessons" &&
        Array.isArray(row.sections) &&
        new Set(row.sections.map((section) => section.id)).size !==
          row.sections.length
      )
        throw new Error("レッスンのカテゴリIDが重複しています。");
      if (name === "settings") {
        if (
          key.startsWith("ongoing-lesson-series:") &&
          (!series(row.value) ||
            (row.value as Record<string, unknown>).seriesId !==
              key.slice("ongoing-lesson-series:".length))
        )
          throw new Error("繰り返しレッスンの設定が正しくありません。");
        if (key === "lesson-custom-categories" && !strings(row.value))
          throw new Error("カテゴリの設定が正しくありません。");
      }
    }
  }
}
