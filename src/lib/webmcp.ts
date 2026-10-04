import { allEvents, home, toggleTask } from "../data/repository";
import { learningOverview, nextStepFor } from "../data/learning";
import { importAiEventSchedule } from "../data/aiScheduleImport";
import { applyEventScheduleRevision } from "../data/eventScheduleRevision";
import { parseAiEventSchedule } from "./aiEventSchedule";
import { parseEventScheduleRevision } from "./eventScheduleRevision";
import { localDate } from "./dates";
export type TrainingTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: unknown) => Promise<unknown>;
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const scheduleWorkInputSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 200 },
    description: { type: "string", maxLength: 2000 },
    startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    dueDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    priority: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["title", "description", "startDate", "dueDate", "priority"],
  additionalProperties: false,
};

const stringInput = (
  input: Record<string, unknown>,
  key: string,
  label: string,
) => {
  const value = input[key];
  if (typeof value !== "string" || !value)
    throw new Error(`${label} is required.`);
  return value;
};

async function eventForTool(eventId: string) {
  const event = (await allEvents()).find((item) => item.id === eventId);
  if (!event) throw new Error("Event not found. Read the event list again.");
  return event;
}

export function trainingTools(): TrainingTool[] {
  return [
    {
      name: "read_training_overview",
      description:
        "Read current dance learning themes, next practice actions, notes, events and existing plans. Does not modify data.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        untrustedContentHint: true,
      },
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
    },
    {
      name: "read_event_schedule",
      description:
        "Read the latest event schedule for a conversation about priorities, timing or replanning. With no eventId, returns an event list for disambiguation. With eventId, returns stable item IDs, dates, progress, history and an eventUpdatedAt version. For a new or major plan, ask 2-5 focused questions about missing high-impact constraints before proposing dates; do not repeat facts already returned or supplied by the user. Always call this tool again before proposing or applying changes.",
      inputSchema: {
        type: "object",
        properties: { eventId: { type: "string" } },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        if (!object(input)) throw new Error("Input must be an object.");
        const events = await allEvents();
        if (input.eventId === undefined)
          return {
            events: events.map((event) => ({
              id: event.id,
              title: event.title,
              date: event.date,
              status: event.status,
            })),
          };
        if (typeof input.eventId !== "string")
          throw new Error("eventId must be a string.");
        const event = events.find((item) => item.id === input.eventId);
        if (!event)
          throw new Error("Event not found. Read the event list again.");
        return {
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          eventUpdatedAt: event.updatedAt,
          status: event.status,
          description: event.description ?? null,
          milestones: (event.milestones ?? []).map((item) => ({
            ...item,
            editable: item.status !== "achieved" && item.status !== "skipped",
          })),
          workItems: (event.workItems ?? []).map((item) => ({
            ...item,
            editable: item.status !== "completed",
          })),
        };
      },
    },
    {
      name: "revise_event_schedule",
      description:
        "Apply date changes to existing event schedule items only after this sequence in Chat: ask focused questions about missing high-impact constraints, show a readable proposal with every old and new date and reason, invite corrections, then obtain the user's explicit agreement to that exact proposal. Never call while asking questions, brainstorming or revising a draft. First call read_event_schedule again and pass its eventUpdatedAt unchanged. This preserves baselines and appends reasons to change history.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          expectedUpdatedAt: { type: "string" },
          changes: {
            type: "array",
            maxItems: 250,
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["milestone", "work"] },
                id: { type: "string" },
                startDate: {
                  type: ["string", "null"],
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                dueDate: {
                  type: ["string", "null"],
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                reason: { type: "string" },
              },
              required: ["kind", "id", "startDate", "dueDate", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["eventId", "expectedUpdatedAt", "changes"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        untrustedContentHint: false,
      },
      execute: async (input) => {
        if (!object(input)) throw new Error("Input must be an object.");
        const eventId = stringInput(input, "eventId", "eventId");
        const expectedUpdatedAt = stringInput(
          input,
          "expectedUpdatedAt",
          "expectedUpdatedAt",
        );
        if (!Array.isArray(input.changes))
          throw new Error("changes is required.");
        const event = await eventForTool(eventId);
        const draft = parseEventScheduleRevision(
          JSON.stringify({ eventTitle: event.title, changes: input.changes }),
          event,
        );
        const result = await applyEventScheduleRevision(
          eventId,
          expectedUpdatedAt,
          draft,
        );
        const updated = await eventForTool(eventId);
        return {
          changed: result.changes.map((change) => ({
            kind: change.kind,
            id: change.id,
            title: change.title,
            from: change.from,
            to: change.to,
            reason: change.reason,
          })),
          skippedUnchanged: result.skippedUnchanged,
          eventUpdatedAt: updated.updatedAt,
        };
      },
    },
    {
      name: "add_event_schedule_items",
      description:
        "Add new milestones or work items only after this sequence in Chat: ask focused questions about missing high-impact constraints, show a readable draft with dates, priorities and assumptions, invite corrections, then obtain the user's explicit agreement to those exact additions. Never call while asking questions, brainstorming or revising a draft. First call read_event_schedule again and pass its eventUpdatedAt unchanged. Existing items are not changed or deleted; duplicates are skipped.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          expectedUpdatedAt: { type: "string" },
          milestones: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              properties: {
                key: { type: "string", maxLength: 80 },
                title: { type: "string", maxLength: 200 },
                dueDate: {
                  type: "string",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                },
                successCriteria: { type: "string", maxLength: 2000 },
                workItems: {
                  type: "array",
                  items: scheduleWorkInputSchema,
                },
              },
              required: [
                "key",
                "title",
                "dueDate",
                "successCriteria",
                "workItems",
              ],
              additionalProperties: false,
            },
          },
          workItems: {
            type: "array",
            maxItems: 200,
            items: scheduleWorkInputSchema,
          },
        },
        required: ["eventId", "expectedUpdatedAt", "milestones", "workItems"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        untrustedContentHint: false,
      },
      execute: async (input) => {
        if (!object(input)) throw new Error("Input must be an object.");
        const eventId = stringInput(input, "eventId", "eventId");
        const expectedUpdatedAt = stringInput(
          input,
          "expectedUpdatedAt",
          "expectedUpdatedAt",
        );
        if (!Array.isArray(input.milestones) || !Array.isArray(input.workItems))
          throw new Error("milestones and workItems are required.");
        const event = await eventForTool(eventId);
        const draft = parseAiEventSchedule(
          JSON.stringify({
            eventTitle: event.title,
            milestones: input.milestones,
            workItems: input.workItems,
          }),
          event,
        );
        const result = await importAiEventSchedule(
          eventId,
          expectedUpdatedAt,
          draft,
        );
        const updated = await eventForTool(eventId);
        return {
          addedMilestones: result.milestones,
          addedWorkItems: result.workItems,
          skippedMilestones: result.skippedMilestones,
          skippedWorkItems: result.skippedWorkItems,
          eventUpdatedAt: updated.updatedAt,
        };
      },
    },
    {
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        idempotentHint: true,
        untrustedContentHint: false,
      },
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
    },
  ];
}

export function trainingChatAvailable() {
  return !!(
    document as Document & {
      modelContext?: { registerTool?: unknown };
    }
  ).modelContext?.registerTool;
}

export function registerTrainingTools() {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: TrainingTool,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  const register = (tool: TrainingTool) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {
      /* The optional browser API must not prevent normal app use. */
    }
  };
  for (const tool of trainingTools()) register(tool);
  return () => controller.abort();
}
