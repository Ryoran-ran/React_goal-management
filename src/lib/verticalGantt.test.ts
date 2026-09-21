import { describe, expect, it } from "vitest";
import type { EventWorkItem } from "../types";
import { workOverview } from "./verticalGantt";
import { ganttSegment } from "./milestones";

const work = (
  id: string,
  patch: Partial<EventWorkItem> = {},
): EventWorkItem => ({
  id,
  title: id,
  description: "",
  priority: "medium",
  status: "not_started",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  changes: [],
  ...patch,
});

describe("vertical milestone overview", () => {
  it("summarizes separated work periods including completed work while preserving the original plan", () => {
    const items = [
      work("first", {
        startDate: "2026-09-05",
        dueDate: "2026-09-07",
        baseline: { startDate: "2026-09-01", dueDate: "2026-09-03" },
        status: "completed",
        actualStartDate: "2026-09-05",
        completedDate: "2026-09-08",
      }),
      work("next", {
        startDate: "2026-09-20",
        dueDate: "2026-09-25",
        baseline: { startDate: "2026-09-18", dueDate: "2026-09-22" },
        status: "in_progress",
        actualStartDate: "2026-09-19",
      }),
    ];
    expect(workOverview(items, "2026-09-21")).toEqual({
      planned: { startDate: "2026-09-05", dueDate: "2026-09-25" },
      baseline: { startDate: "2026-09-01", dueDate: "2026-09-22" },
      actual: { startDate: "2026-09-05", dueDate: "2026-09-21" },
    });
    expect(items[0].dueDate).toBe("2026-09-07");
  });
  it("does not invent periods or actual dates for undated legacy work", () => {
    expect(
      workOverview([work("unknown", { status: "completed" })], "2026-09-21"),
    ).toEqual({ planned: {}, baseline: {}, actual: {} });
    expect(workOverview([], "2026-09-21")).toEqual({
      planned: {},
      baseline: {},
      actual: {},
    });
    expect(
      workOverview([work("deadline", { dueDate: "2026-10-01" })], "2026-09-21")
        .planned,
    ).toEqual({ startDate: "2026-10-01", dueDate: "2026-10-01" });
  });
  it("clips a summary to the selected dates using inclusive full-day cells", () => {
    const plan = workOverview(
      [work("wide", { startDate: "2026-08-01", dueDate: "2026-09-03" })],
      "2026-09-21",
    ).planned;
    expect(
      ganttSegment(plan.startDate!, plan.dueDate!, {
        start: "2026-09-01",
        end: "2026-09-10",
      }),
    ).toEqual({ left: "0%", width: "30%" });
  });
});
