import { db } from "./db";
import type { Goal } from "../types";

const cleanupKey = "migration:remove-unused-default-goals-v1";
const originalTitles = [
  "下半身の強化",
  "頭の安定化",
  "体を使いながらブレない体幹を持つ",
];

// Old releases did not tag seeded goals. Only recognize the complete initial
// batch, then remove unchanged, unreferenced entries. Never match titles alone.
export async function removeUnusedDefaultGoals() {
  if (await db.settings.get(cleanupKey)) return;
  const removed: Goal[] = [];
  if ((await db.settings.get("initialized"))?.value === true) {
    const goals = await db.goals.toArray();
    const firstCreated = Math.min(...goals.map((g) => Date.parse(g.createdAt)));
    const initialBatch = goals.filter((g) => {
      const age = Date.parse(g.createdAt) - firstCreated;
      return age >= 0 && age <= 1000;
    });
    const originals = originalTitles.map((title) =>
      initialBatch.filter((g) => g.title === title),
    );
    if (originals.every((matches) => matches.length === 1)) {
      for (const [goal] of originals) {
        if (
          goal.createdAt !== goal.updatedAt ||
          goal.status !== "not_started" ||
          goal.priority !== "medium" ||
          goal.progress !== 0 ||
          goal.eventIds.length !== 0 ||
          goal.description !== undefined ||
          goal.successCriteria !== undefined ||
          goal.targetDate !== undefined ||
          goal.parentGoalId !== undefined ||
          goal.category !== undefined
        )
          continue;
        const id = goal.id;
        const referenced =
          goals.some((g) => g.parentGoalId === id) ||
          !!(await db.events.where("goalIds").equals(id).first()) ||
          !!(await db.monthlyPlans
            .filter(
              (p) =>
                p.focusGoalIds.includes(id) ||
                p.objectives.some((o) => o.goalId === id),
            )
            .first()) ||
          !!(await db.weeklyPlans
            .filter(
              (p) =>
                p.focusGoalIds.includes(id) ||
                p.tasks.some((t) => t.goalIds.includes(id)),
            )
            .first()) ||
          !!(await db.practiceLogs
            .filter((p) => p.goalIds.includes(id))
            .first()) ||
          !!(await db.lessons
            .filter(
              (l) =>
                l.relatedGoalIds.includes(id) ||
                [...l.plannedTopics, ...l.actualTopics].some(
                  (t) => t.goalId === id,
                ),
            )
            .first()) ||
          !!(await db.attachments
            .where("[relatedType+relatedId]")
            .equals(["goal", id])
            .first());
        if (!referenced) {
          removed.push(goal);
          await db.goals.delete(id);
        }
      }
    }
  }
  // Retain the old values locally, so this migration is reversible if needed.
  await db.settings.put({
    id: cleanupKey,
    value: { completedAt: new Date().toISOString(), removedGoals: removed },
  });
}
