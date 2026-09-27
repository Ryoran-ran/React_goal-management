import { describe, expect, it } from "vitest";
import type { EventWorkItem } from "../types";
import { preparationWorkGroups } from "./preparationOverview";

const work = (
  id: string,
  values: Partial<EventWorkItem> = {},
): EventWorkItem => ({
  id,
  title: id,
  description: "",
  priority: "medium",
  status: "not_started",
  changes: [],
  createdAt: `2026-09-${id.padStart(2, "0")}T00:00:00.000Z`,
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...values,
});

describe("mobile preparation overview", () => {
  it("separates unfinished work into overdue, current, later and unscheduled groups", () => {
    const groups = preparationWorkGroups(
      [
        work("1", { dueDate: "2026-09-19" }),
        work("2", { dueDate: "2026-09-24" }),
        work("3", {
          startDate: "2026-09-18",
          dueDate: "2026-10-20",
        }),
        work("4", { dueDate: "2026-10-21" }),
        work("5"),
        work("6", { status: "completed", dueDate: "2026-09-18" }),
      ],
      "2026-09-20",
    );

    expect(groups.map(({ id }) => id)).toEqual([
      "overdue",
      "now",
      "later",
      "unscheduled",
    ]);
    expect(groups.map(({ items }) => items.map(({ id }) => id))).toEqual([
      ["1"],
      ["2", "3"],
      ["4"],
      ["5"],
    ]);
  });

  it("keeps active work visible now even when its date is farther away", () => {
    const groups = preparationWorkGroups(
      [work("1", { status: "in_progress", dueDate: "2027-01-01" })],
      "2026-09-20",
    );

    expect(groups[0]).toMatchObject({ id: "now" });
    expect(groups[0].items[0].id).toBe("1");
  });
});
