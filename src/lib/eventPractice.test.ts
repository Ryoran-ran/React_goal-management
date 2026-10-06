import { describe, expect, it } from "vitest";
import type { DanceEvent, EventPracticeSession } from "../types";
import { base } from "../data/repository";
import {
  eventPracticeDisplayStatus,
  eventPracticePromptSummary,
  eventPracticeSummary,
  shiftEventPracticeSessions,
  validateEventPracticeSessions,
} from "./eventPractice";

const session = (
  date: string,
  status: EventPracticeSession["status"] = "planned",
): EventPracticeSession => ({
  ...base(),
  date,
  kind: "practice",
  title: "",
  status,
  memo: "",
});

const event = (practiceSessions: EventPracticeSession[]): DanceEvent => ({
  ...base(),
  title: "大会",
  type: "competition",
  date: "2026-10-20",
  status: "planned",
  goalIds: [],
  practiceSessions,
});

describe("event practice schedule", () => {
  it("separates upcoming, completed, missed and cancelled sessions", () => {
    const result = eventPracticeSummary(
      event([
        session("2026-10-09"),
        session("2026-10-10"),
        session("2026-10-20"),
        session("2026-10-21"),
        session("2026-10-08", "completed"),
        session("2026-10-12", "cancelled"),
      ]),
      "2026-10-10",
    );
    expect(result).toEqual({
      upcoming: 2,
      completed: 1,
      missed: 1,
      cancelled: 1,
    });
  });

  it("shows an overdue planned session as missed without changing storage", () => {
    const item = session("2026-10-09");
    expect(eventPracticeDisplayStatus(item, "2026-10-10")).toBe("missed");
    expect(item.status).toBe("planned");
  });

  it("builds an AI summary with remaining sessions by type", () => {
    const result = eventPracticePromptSummary(
      event([
        session("2026-10-12"),
        { ...session("2026-10-13"), kind: "lesson" },
        { ...session("2026-10-14"), kind: "custom", title: "リハーサル" },
        session("2026-10-09"),
        session("2026-10-08", "completed"),
      ]),
      "2026-10-10",
    );
    expect(result).toEqual({
      scheduledRemaining: 3,
      completed: 1,
      missed: 1,
      cancelled: 0,
      remainingByType: { lesson: 1, selfPractice: 1, other: 1 },
    });
  });

  it("shifts only planned sessions when the event date moves", () => {
    const planned = session("2026-10-10");
    const completed = session("2026-10-09", "completed");
    const shifted = shiftEventPracticeSessions([planned, completed], 3);
    expect(shifted[0].date).toBe("2026-10-13");
    expect(shifted[1].date).toBe("2026-10-09");
  });

  it("requires a name only for custom sessions", () => {
    expect(() => validateEventPracticeSessions([session("2026-10-10")])).not
      .toThrow;
    expect(() =>
      validateEventPracticeSessions([
        { ...session("2026-10-10"), kind: "custom" },
      ]),
    ).toThrow("練習予定");
  });
});
