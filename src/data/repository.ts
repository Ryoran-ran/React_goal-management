import { liveQuery } from "dexie";
import { validateMilestones } from "../lib/milestones";
import { db } from "./db";
import { removeUnusedDefaultGoals } from "./migrations";
import { retireTechnicalGoals } from "./retireGoals";
import { goalCategories, goalCategory } from "../lib/goalCategories";
import { youtubeLink } from "../lib/lessonContent";
import {
  categoryNameKey,
  lessonCategoryKey,
  namedLessonCategory,
} from "../lib/lessonCategories";
import {
  customLessonCategories,
  lessonCategoriesSetting,
} from "./lessonCategories";
import type {
  Attachment,
  Base,
  DanceEvent,
  Goal,
  Lesson,
  MonthlyPlan,
  PracticeLog,
  WeeklyPlan,
  LearningNote,
} from "../types";
import { localDate, monthRange, weekOf } from "../lib/dates";
export interface Records {
  events: DanceEvent;
  goals: Goal;
  monthlyPlans: MonthlyPlan;
  weeklyPlans: WeeklyPlan;
  practiceLogs: PracticeLog;
  lessons: Lesson;
  learningNotes: LearningNote;
}
export type Kind = keyof Records;
export const base = (): Base => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
};
export const relationType = {
  events: "event",
  goals: "goal",
  practiceLogs: "practice",
  lessons: "lesson",
  learningNotes: "learning",
} as const;
export async function initialize() {
  await db.transaction("rw", db.tables, async () => {
    await removeUnusedDefaultGoals();
    await retireTechnicalGoals();
    if (await db.settings.get("initialized")) return;
    await db.settings.put({ id: "initialized", value: true });
  });
}
export function watch<T>(
  query: () => Promise<T>,
  next: (value: T) => void,
  error: (error: unknown) => void,
  prepare?: () => Promise<unknown>,
) {
  const subscribe = () => liveQuery(query).subscribe({ next, error });
  if (!prepare) return subscribe();
  // Writes must finish before entering Dexie's read-only liveQuery context.
  let stopped = false;
  let subscription: ReturnType<typeof subscribe> | undefined;
  Promise.resolve()
    .then(prepare)
    .then(() => {
      if (!stopped) subscription = subscribe();
    })
    .catch((cause) => {
      if (!stopped) error(cause);
    });
  return {
    unsubscribe() {
      stopped = true;
      subscription?.unsubscribe();
    },
  };
}
export const allGoals = () => db.goals.toArray();
export const allEvents = () => db.events.orderBy("date").toArray();
export async function list<K extends Kind>(
  kind: K,
  month?: string,
): Promise<Records[K][]> {
  if ((kind === "practiceLogs" || kind === "lessons") && month) {
    const { start, end } = monthRange(month);
    return db
      .table<Records[K]>(kind)
      .where("date")
      .between(start, end, true, true)
      .reverse()
      .toArray();
  }
  return db.table<Records[K]>(kind).toArray();
}
export function monthly(value: string) {
  const [year, month] = value.split("-").map(Number);
  return db.monthlyPlans.where("[year+month]").equals([year, month]).first();
}
export function weekly(value: string) {
  return db.weeklyPlans
    .where("startDate")
    .equals(weekOf(value).startDate)
    .first();
}
export async function savePlanWithFocusGoals<
  K extends "weeklyPlans" | "monthlyPlans",
>(kind: K, plan: Records[K], titles: string[]): Promise<Records[K]> {
  const names = [
    ...new Set(titles.map((title) => title.trim()).filter(Boolean)),
  ];
  if (names.some((title) => title.length > 200))
    throw new Error("重点目標は1件200文字以内で入力してください。");
  return db.transaction("rw", db.tables, async () => {
    const goals = await allGoals();
    const focusGoalIds = new Set(plan.focusGoalIds);
    for (const title of names) {
      const existing = goals.find(
        (goal) =>
          goal.title.trim() === title && goalCategory(goal) === "general",
      );
      if (existing) {
        focusGoalIds.add(existing.id);
      } else {
        const goal: Goal = {
          ...base(),
          title,
          status: "not_started",
          priority: "medium",
          progress: 0,
          eventIds: [],
        };
        await save("goals", goal);
        focusGoalIds.add(goal.id);
      }
    }
    const updated = { ...plan, focusGoalIds: [...focusGoalIds] };
    await save(kind, updated);
    return updated;
  });
}
export async function savePlanWithDraftGoals<
  K extends "weeklyPlans" | "monthlyPlans",
>(kind: K, plan: Records[K], drafts: Goal[]): Promise<void> {
  const usedIds = new Set([
    ...plan.focusGoalIds,
    ...("tasks" in plan
      ? plan.tasks.flatMap((task) => task.goalIds)
      : plan.objectives.flatMap((objective) =>
          objective.goalId ? [objective.goalId] : [],
        )),
  ]);
  await db.transaction("rw", db.tables, async () => {
    for (const goal of drafts.filter((goal) => usedIds.has(goal.id))) {
      if (await db.goals.get(goal.id))
        throw new Error(
          "技術目標が更新されています。画面を開き直してください。",
        );
      await save("goals", goal);
    }
    await save(kind, plan);
  });
}
export function previousLesson(date: string, excludeId: string) {
  return db.lessons
    .where("date")
    .belowOrEqual(date)
    .reverse()
    .filter((l) => l.completed && !l.cancelled && l.id !== excludeId)
    .first();
}
export async function home(today: string) {
  const week = weekOf(today);
  const month = monthRange(today.slice(0, 7));
  const [
    events,
    goals,
    monthlyPlan,
    weeklyPlan,
    todayLog,
    weekLogs,
    nextLesson,
    monthLessons,
    lastLesson,
  ] = await Promise.all([
    db.events
      .where("date")
      .aboveOrEqual(today)
      .filter((e) => e.status === "planned" || e.status === "active")
      .toArray(),
    allGoals(),
    monthly(today.slice(0, 7)),
    weekly(today),
    db.practiceLogs
      .where("date")
      .equals(today)
      .filter((log) => !log.status || log.status === "recorded")
      .first(),
    db.practiceLogs
      .where("date")
      .between(week.startDate, week.endDate, true, true)
      .filter((log) => !log.status || log.status === "recorded")
      .toArray(),
    db.lessons
      .where("date")
      .aboveOrEqual(today)
      .filter((l) => !l.completed && !l.cancelled)
      .first(),
    db.lessons
      .where("date")
      .between(month.start, month.end, true, true)
      .toArray(),
    db.lessons
      .where("date")
      .belowOrEqual(today)
      .reverse()
      .filter((l) => l.completed && !l.cancelled)
      .first(),
  ]);
  return {
    events,
    goals,
    monthlyPlan,
    weeklyPlan,
    todayLog,
    weekLogs,
    nextLesson,
    monthLessons,
    lastLesson,
  };
}
function validate<K extends Kind>(kind: K, record: Records[K]) {
  if (kind === "events" && (record as DanceEvent).milestones !== undefined)
    validateMilestones((record as DanceEvent).milestones);
  if (kind === "learningNotes") {
    const note = record as LearningNote;
    if (!["lesson", "practice", "reflection"].includes(note.kind))
      throw new Error("記録の種類を選んでください。");
    if (note.youtubeUrls.some((url) => url.trim() && !youtubeLink(url)))
      throw new Error("YouTubeの動画URLを確認してください。");
  }
  if (kind === "lessons") {
    const sections = (record as Lesson).sections ?? [];
    if (
      new Set(sections.map((section) => section.id)).size !== sections.length ||
      new Set(sections.map(lessonCategoryKey)).size !== sections.length
    )
      throw new Error("レッスンのカテゴリが重複しています。");
    for (const section of sections) {
      if (
        !section.id ||
        (section.category !== "custom" &&
          !Object.hasOwn(goalCategories, section.category))
      )
        throw new Error("レッスンのカテゴリを選んでください。");
      if (
        section.category === "custom" &&
        (!section.customCategory?.trim() ||
          section.customCategory.trim().length > 80)
      )
        throw new Error("カテゴリ名は1〜80文字で入力してください。");
      if (section.youtubeUrls.some((url) => url.trim() && !youtubeLink(url)))
        throw new Error("YouTubeの動画URLを確認してください。");
    }
  }
  if (
    kind === "goals" &&
    (record as Goal).category !== undefined &&
    !Object.hasOwn(goalCategories, (record as Goal).category!)
  )
    throw new Error("技術目標のカテゴリを選び直してください。");
  if (
    kind === "lessons" &&
    (record as Lesson).cancelled &&
    (record as Lesson).completed
  )
    throw new Error("中止したレッスンは実施済みにできません。");
  if (!record.id) throw new Error("IDがありません。");
  if (
    "title" in record &&
    kind !== "lessons" &&
    kind !== "practiceLogs" &&
    !record.title?.trim()
  )
    throw new Error("名前を入力してください。");
  if (
    "date" in record &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
      localDate(new Date(`${record.date}T12:00:00`)) !== record.date)
  )
    throw new Error("正しい日付を入力してください。");
  if (
    "progress" in record &&
    (!Number.isFinite(record.progress) ||
      record.progress < 0 ||
      record.progress > 100)
  )
    throw new Error("進捗は0〜100で入力してください。");
  if (
    "durationMinutes" in record &&
    record.durationMinutes !== undefined &&
    (!Number.isInteger(record.durationMinutes) ||
      record.durationMinutes < 0 ||
      record.durationMinutes > 1440)
  )
    throw new Error("時間は0〜1440分で入力してください。");
  if (kind === "monthlyPlans") {
    const plan = record as MonthlyPlan;
    if (
      !Number.isInteger(plan.year) ||
      plan.year < 1 ||
      !Number.isInteger(plan.month) ||
      plan.month < 1 ||
      plan.month > 12
    )
      throw new Error("正しい年月を選んでください。");
    if (
      plan.lessonTargetCount !== undefined &&
      (!Number.isInteger(plan.lessonTargetCount) ||
        plan.lessonTargetCount < 0 ||
        plan.lessonTargetCount > 100)
    )
      throw new Error("レッスン回数は0〜100で入力してください。");
    if (
      plan.objectives.some(
        (o) =>
          !o.title.trim() ||
          !Number.isFinite(o.progress) ||
          o.progress < 0 ||
          o.progress > 100,
      )
    )
      throw new Error("到達点の名前と進捗を確認してください。");
  }
  if (kind === "weeklyPlans") {
    const plan = record as WeeklyPlan;
    const period = weekOf(plan.startDate);
    if (period.startDate !== plan.startDate || period.endDate !== plan.endDate)
      throw new Error("計画は月曜から日曜までの期間で指定してください。");
    if (plan.tasks.some((t) => !t.title.trim()))
      throw new Error("練習項目を入力してください。");
  }
  if (
    kind === "lessons" &&
    [
      ...(record as Lesson).plannedTopics,
      ...(record as Lesson).actualTopics,
    ].some((t) => !t.title.trim())
  )
    throw new Error("レッスン内容を入力してください。");
}
export async function save<K extends Kind>(
  kind: K,
  input: Records[K],
  files: File[] = [],
  removeAttachments: string[] = [],
  fileSectionIds: (string | undefined)[] = [],
) {
  validate(kind, input);
  const record = { ...input, updatedAt: new Date().toISOString() };
  if (kind === "lessons") {
    const lesson = record as Lesson;
    lesson.sections = lesson.sections?.map((section) =>
      section.category === "custom"
        ? { ...section, ...namedLessonCategory(section.customCategory!) }
        : section,
    );
  }
  if ("focusGoalIds" in record && record.focusDetails) {
    record.focusDetails = Object.fromEntries(
      Object.entries(record.focusDetails)
        .filter(([id, text]) => record.focusGoalIds.includes(id) && text.trim())
        .map(([id, text]) => [id, text.trim()]),
    );
  }
  const relatedType =
    kind in relationType
      ? relationType[kind as keyof typeof relationType]
      : undefined;
  const prepared = files.map((file, index) => {
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        ...(kind === "lessons" || kind === "learningNotes"
          ? ["video/mp4", "video/webm", "video/quicktime"]
          : []),
      ].includes(file.type)
    )
      throw new Error(
        kind === "lessons" || kind === "learningNotes"
          ? "画像（JPEG・PNG・WebP・GIF）か動画（MP4・WebM・MOV）を選んでください。"
          : "JPEG・PNG・WebP・GIF画像を選んでください。",
      );
    const sectionId = fileSectionIds[index];
    if (
      sectionId &&
      (kind !== "lessons" ||
        !(record as Lesson).sections?.some(
          (section) => section.id === sectionId,
        ))
    )
      throw new Error("資料の登録先カテゴリが見つかりません。");
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type,
      size: file.size,
      relatedType: relatedType!,
      relatedId: record.id,
      ...(sectionId ? { sectionId } : {}),
      createdAt: new Date().toISOString(),
    };
    return { attachment, blob: file.slice(0, file.size, file.type) };
  });
  await db.transaction("rw", db.tables, async () => {
    if (kind === "learningNotes") {
      const note = record as LearningNote;
      if (note.themeId && !(await db.themes.get(note.themeId)))
        throw new Error("テーマが見つかりません。選び直してください。");
      if (note.source) {
        const previous = await db.learningNotes.get(note.id);
        const sameSource =
          previous?.source?.kind === note.source.kind &&
          previous?.source?.id === note.source.id;
        if (note.source.kind !== "lesson" && note.source.kind !== "practice")
          throw new Error("予定の種類を確認してください。");
        const table =
          note.source.kind === "lesson" ? db.lessons : db.practiceLogs;
        const source = await table.get(note.source.id);
        if (!source && !sameSource)
          throw new Error("元の予定が見つかりません。");
        if (!source) delete note.source;
        if (source && !sameSource && note.source) {
          if (
            ("cancelled" in source && source.cancelled) ||
            ("status" in source && source.status === "cancelled")
          )
            throw new Error(
              "中止した予定です。予定を戻してから記録してください。",
            );
          if (note.source.kind === "lesson")
            await db.lessons.update(note.source.id, { completed: true });
          else
            await db.practiceLogs.update(note.source.id, {
              practiced: true,
              status: "recorded",
            });
        }
      }
    }
    const goalIds =
      kind === "events"
        ? (record as DanceEvent).goalIds
        : kind === "practiceLogs"
          ? (record as PracticeLog).goalIds
          : kind === "lessons"
            ? [
                ...(record as Lesson).relatedGoalIds,
                ...[
                  ...(record as Lesson).plannedTopics,
                  ...(record as Lesson).actualTopics,
                ].flatMap((t) => (t.goalId ? [t.goalId] : [])),
              ]
            : kind === "monthlyPlans"
              ? [
                  ...(record as MonthlyPlan).focusGoalIds,
                  ...(record as MonthlyPlan).objectives.flatMap((o) =>
                    o.goalId ? [o.goalId] : [],
                  ),
                ]
              : kind === "weeklyPlans"
                ? [
                    ...(record as WeeklyPlan).focusGoalIds,
                    ...(record as WeeklyPlan).tasks.flatMap((t) => t.goalIds),
                  ]
                : [];
    for (const id of new Set(goalIds))
      if (!(await db.goals.get(id)))
        throw new Error("関連目標が削除されています。選択し直してください。");
    if (kind === "lessons")
      for (const id of (record as Lesson).relatedEventIds)
        if (!(await db.events.get(id)))
          throw new Error(
            "関連イベントが削除されています。選択し直してください。",
          );
    if (kind === "goals") {
      const goal = record as Goal;
      let parent = goal.parentGoalId;
      const visited = new Set([goal.id]);
      while (parent) {
        if (visited.has(parent)) throw new Error("親目標が循環しています。");
        visited.add(parent);
        const ancestor = await db.goals.get(parent);
        if (!ancestor) throw new Error("親目標が見つかりません。");
        parent = ancestor.parentGoalId;
      }
      for (const id of goal.eventIds)
        if (!(await db.events.get(id)))
          throw new Error("関連イベントが見つかりません。");
      await db.events.toCollection().modify((event) => {
        event.goalIds = event.goalIds.filter((id) => id !== goal.id);
        if (goal.eventIds.includes(event.id)) event.goalIds.push(goal.id);
      });
    }
    if (kind === "events") {
      const event = record as DanceEvent;
      for (const id of event.goalIds)
        if (!(await db.goals.get(id)))
          throw new Error("関連目標が見つかりません。");
      await db.goals.toCollection().modify((goal) => {
        goal.eventIds = goal.eventIds.filter((id) => id !== event.id);
        if (event.goalIds.includes(goal.id)) goal.eventIds.push(event.id);
      });
    }
    if (relatedType) {
      if (kind === "lessons") {
        const sectionIds = new Set(
          (record as Lesson).sections?.map((section) => section.id) ?? [],
        );
        const orphaned = await db.attachments
          .where("[relatedType+relatedId]")
          .equals([relatedType, record.id])
          .filter(
            (attachment) =>
              !!attachment.sectionId && !sectionIds.has(attachment.sectionId),
          )
          .toArray();
        for (const attachment of orphaned) {
          await db.attachments.delete(attachment.id);
          await db.attachmentFiles.delete(attachment.id);
        }
      }
      for (const id of removeAttachments) {
        const item = await db.attachments.get(id);
        if (item?.relatedId === record.id && item.relatedType === relatedType) {
          await db.attachments.delete(id);
          await db.attachmentFiles.delete(id);
        }
      }
      for (const { attachment, blob } of prepared) {
        await db.attachments.add(attachment);
        await db.attachmentFiles.add({ id: attachment.id, blob });
      }
      if ("attachmentIds" in record)
        record.attachmentIds = (await db.attachments
          .where("[relatedType+relatedId]")
          .equals([relatedType, record.id])
          .primaryKeys()) as string[];
    }
    if (kind === "lessons") {
      const names = await customLessonCategories();
      for (const section of (record as Lesson).sections ?? []) {
        if (
          section.category === "custom" &&
          !names.some(
            (name) =>
              categoryNameKey(name) ===
              categoryNameKey(section.customCategory!),
          )
        )
          names.push(section.customCategory!);
      }
      if (names.length)
        await db.settings.put({ id: lessonCategoriesSetting, value: names });
    }
    await db.table<Records[K]>(kind).put(record);
  });
}
export async function remove(kind: Kind, id: string) {
  await db.transaction("rw", db.tables, async () => {
    if (kind === "events")
      await db.themes.toCollection().modify((theme) => {
        theme.eventIds = theme.eventIds.filter((eventId) => eventId !== id);
      });
    if (kind === "goals")
      await db.themes.toCollection().modify((theme) => {
        theme.goalIds = theme.goalIds.filter((goalId) => goalId !== id);
      });
    if (kind === "lessons" || kind === "practiceLogs")
      await db.learningNotes
        .where("[source.kind+source.id]")
        .equals([kind === "lessons" ? "lesson" : "practice", id])
        .modify((note) => {
          delete note.source;
        });
    if (kind === "events") {
      await db.goals.toCollection().modify((g) => {
        g.eventIds = g.eventIds.filter((x) => x !== id);
      });
      await db.lessons.toCollection().modify((l) => {
        l.relatedEventIds = l.relatedEventIds.filter((x) => x !== id);
      });
    }
    if (kind === "goals") {
      await db.events.toCollection().modify((e) => {
        e.goalIds = e.goalIds.filter((x) => x !== id);
      });
      await db.goals.toCollection().modify((g) => {
        if (g.parentGoalId === id) delete g.parentGoalId;
      });
      await db.monthlyPlans.toCollection().modify((p) => {
        p.focusGoalIds = p.focusGoalIds.filter((x) => x !== id);
        if (p.focusDetails) delete p.focusDetails[id];
        p.objectives.forEach((o) => {
          if (o.goalId === id) delete o.goalId;
        });
      });
      await db.weeklyPlans.toCollection().modify((p) => {
        p.focusGoalIds = p.focusGoalIds.filter((x) => x !== id);
        if (p.focusDetails) delete p.focusDetails[id];
        p.tasks.forEach((t) => {
          t.goalIds = t.goalIds.filter((x) => x !== id);
        });
      });
      await db.practiceLogs.toCollection().modify((p) => {
        p.goalIds = p.goalIds.filter((x) => x !== id);
      });
      await db.lessons.toCollection().modify((l) => {
        l.relatedGoalIds = l.relatedGoalIds.filter((x) => x !== id);
        [...l.plannedTopics, ...l.actualTopics].forEach((t) => {
          if (t.goalId === id) delete t.goalId;
        });
      });
    }
    if (kind in relationType) {
      const attachments = await db.attachments
        .where("[relatedType+relatedId]")
        .equals([relationType[kind as keyof typeof relationType], id])
        .primaryKeys();
      await db.attachments.bulkDelete(attachments);
      await db.attachmentFiles.bulkDelete(attachments);
    }
    await db.table(kind).delete(id);
  });
}
export const attachmentsFor = (
  relatedType: Attachment["relatedType"],
  id: string,
) =>
  db.attachments
    .where("[relatedType+relatedId]")
    .equals([relatedType, id])
    .toArray();
export const attachmentBlob = async (id: string) =>
  (await db.attachmentFiles.get(id))?.blob;
export async function toggleTask(
  planId: string,
  taskId: string,
  completed: boolean,
) {
  await db.transaction("rw", db.weeklyPlans, async () => {
    const plan = await db.weeklyPlans.get(planId);
    if (!plan) return;
    plan.tasks = plan.tasks.map((t) =>
      t.id === taskId ? { ...t, completed } : t,
    );
    await db.weeklyPlans.put({ ...plan, updatedAt: new Date().toISOString() });
  });
}
