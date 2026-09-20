import { db } from "./db";

const marker = "migration:retire-technical-goals-v1";

// Called at startup and after restoring an older backup. Never run in liveQuery.
export async function retireTechnicalGoals(force = false) {
  await db.transaction("rw", db.tables, async () => {
    if (!force && (await db.settings.get(marker))) return;
    const goals = await db.goals.toArray();
    const themes = await db.themes.toArray();
    const linkedThemes = (goalIds: string[], existing: string[] = []) => [
      ...new Set([
        ...existing,
        ...themes
          .filter((theme) => theme.goalIds.some((id) => goalIds.includes(id)))
          .map((theme) => theme.id),
      ]),
    ];
    const pointMemo = (details?: Record<string, string>) =>
      Object.entries(details ?? {})
        .filter(([, text]) => text.trim())
        .map(
          ([id, text]) =>
            `${goals.find((goal) => goal.id === id)?.title ?? "練習のポイント"}\n${text}`,
        )
        .join("\n\n");
    const keepMemo = (
      memo: string | undefined,
      details?: Record<string, string>,
    ) => {
      const points = pointMemo(details);
      return points ? [memo, points].filter(Boolean).join("\n\n") : memo;
    };
    await db.lessons.toCollection().modify((lesson) => {
      const topics = [...lesson.plannedTopics, ...lesson.actualTopics];
      const themeIds = linkedThemes(
        [
          ...lesson.relatedGoalIds,
          ...topics.flatMap((topic) => (topic.goalId ? [topic.goalId] : [])),
        ],
        lesson.themeIds,
      );
      if (themeIds.length) lesson.themeIds = themeIds;
      lesson.relatedGoalIds = [];
      topics.forEach((topic) => {
        delete topic.goalId;
      });
    });
    await db.practiceLogs.toCollection().modify((practice) => {
      const themeIds = linkedThemes(practice.goalIds, practice.themeIds);
      if (themeIds.length) practice.themeIds = themeIds;
      practice.goalIds = [];
    });
    await db.events.toCollection().modify((event) => {
      event.goalIds = [];
    });
    await db.themes.toCollection().modify((theme) => {
      theme.goalIds = [];
    });
    await db.weeklyPlans.toCollection().modify((plan) => {
      plan.review = keepMemo(plan.review, plan.focusDetails);
      plan.focusGoalIds = [];
      delete plan.focusDetails;
      plan.tasks.forEach((task) => {
        task.goalIds = [];
      });
    });
    await db.monthlyPlans.toCollection().modify((plan) => {
      plan.notes = keepMemo(plan.notes, plan.focusDetails);
      plan.focusGoalIds = [];
      delete plan.focusDetails;
      plan.objectives.forEach((objective) => {
        delete objective.goalId;
      });
    });
    const media = await db.attachments
      .filter((file) => file.relatedType === "goal")
      .primaryKeys();
    await db.attachments.bulkDelete(media);
    await db.attachmentFiles.bulkDelete(media);
    await db.goals.clear();
    await db.settings.put({ id: marker, value: true });
  });
}
