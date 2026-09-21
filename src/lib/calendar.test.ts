import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarDays,
  calendarValueLabel,
  dateAllowed,
  monthAllowed,
  readWeekStart,
  saveWeekStart,
  shiftCalendarMonth,
} from "./calendar";

afterEach(() => vi.unstubAllGlobals());

describe("app calendar", () => {
  it("lays out six complete weeks with any chosen first weekday", () => {
    for (let start = 0; start < 7; start++) {
      const days = calendarDays("2026-09", start);
      expect(days).toHaveLength(42);
      expect(new Set(days).size).toBe(42);
      expect(new Date(`${days[0]}T12:00:00`).getDay()).toBe(start);
      expect(days.filter((day) => day.startsWith("2026-09"))).toHaveLength(30);
      for (let i = 1; i < days.length; i++)
        expect(days[i] > days[i - 1]).toBe(true);
    }
    expect(calendarDays("2026-09", 1)[0]).toBe("2026-08-31");
    expect(calendarDays("2026-09", 0)[0]).toBe("2026-08-30");
  });
  it("handles leap days, year boundaries and early years", () => {
    expect(calendarDays("2024-02", 1)).toContain("2024-02-29");
    expect(calendarDays("2025-02", 1)).not.toContain("2025-02-29");
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("0099-12", 1)).toBe("0100-01");
    expect(monthAllowed("0004-02", "0004-02-29", "0004-02-29")).toBe(true);
  });
  it("allows inclusive bounds and months containing a selectable date", () => {
    expect(dateAllowed("2026-09-21", "2026-09-21", "2026-09-30")).toBe(true);
    expect(dateAllowed("2026-09-20", "2026-09-21")).toBe(false);
    expect(dateAllowed("2026-10-01", undefined, "2026-09-30")).toBe(false);
    expect(dateAllowed("2026-09", "2026-09", "2026-09")).toBe(true);
    expect(dateAllowed("10000-01-01")).toBe(false);
    expect(dateAllowed("0000-12-31")).toBe(false);
    expect(monthAllowed("2026-09", "2026-09-21", "2026-10-05")).toBe(true);
    expect(monthAllowed("2026-08", "2026-09-21")).toBe(false);
  });
  it("uses a consistent Gregorian label independent of the system calendar", () => {
    expect(calendarValueLabel("2026-09-21", "date")).toBe("2026/09/21（月）");
    expect(calendarValueLabel("2026-09", "month")).toBe("2026年9月");
    expect(calendarValueLabel("", "date")).toBe("");
  });
  it("remembers Sunday (zero), defaults to Monday, and tolerates blocked storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    expect(readWeekStart()).toBe(1);
    saveWeekStart(0);
    expect(readWeekStart()).toBe(0);
    saveWeekStart(6);
    expect(readWeekStart()).toBe(6);
    saveWeekStart(7);
    expect(readWeekStart()).toBe(6);
    data.set("dance-note:calendar-week-start", "invalid");
    expect(readWeekStart()).toBe(1);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readWeekStart()).toBe(1);
    expect(() => saveWeekStart(0)).not.toThrow();
  });
});
