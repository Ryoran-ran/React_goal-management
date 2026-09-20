import { home, toggleTask } from "../data/repository";
import { learningOverview, nextStepFor } from "../data/learning";
import { localDate } from "./dates";
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
export function registerTrainingTools() {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: Tool,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  const register = (tool: Tool) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {
      /* The optional browser API must not prevent normal app use. */
    }
  };
  register({
    name: "read_training_overview",
    description:
      "Read current dance learning themes, next practice actions, notes, events and existing plans. Does not modify data.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async () => {
      const [data, learning] = await Promise.all([
        home(localDate()),
        learningOverview(localDate()),
      ]);
      return {
        events: data.events,
        weeklyPlan: data.weeklyPlan ?? null,
        monthlyPlan: data.monthlyPlan ?? null,
        todayLog: data.todayLog ?? null,
        themes: learning.themes.map((theme) => ({
          ...theme,
          nextStep: nextStepFor(theme, learning.notes),
        })),
        learningNotes: learning.notes,
      };
    },
  });
  register({
    name: "set_weekly_task_completed",
    description:
      "Set the completion of one existing task in the current week’s local training plan. The home checklist updates from the same saved record.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["taskId", "completed"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input) => {
      if (
        !input ||
        typeof input !== "object" ||
        !("taskId" in input) ||
        typeof input.taskId !== "string" ||
        !("completed" in input) ||
        typeof input.completed !== "boolean"
      )
        throw new Error("taskId and completed are required.");
      const data = await home(localDate());
      const plan = data.weeklyPlan;
      if (!plan?.tasks.some((t) => t.id === input.taskId))
        throw new Error("Task not found in the current week.");
      await toggleTask(plan.id, input.taskId, input.completed);
      return { taskId: input.taskId, completed: input.completed };
    },
  });
  return () => controller.abort();
}
