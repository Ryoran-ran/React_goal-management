import { describe, it, expect } from "vitest";
import {
  addDays,
  countdownLabel,
  daysUntil,
  monthRange,
  weekOf,
} from "./dates";
describe("calendar boundaries", () => {
  it("uses Monday weeks across years", () => {
    expect(weekOf("2027-01-03")).toEqual({
      startDate: "2026-12-28",
      endDate: "2027-01-03",
    });
    expect(weekOf("2027-01-04").startDate).toBe("2027-01-04");
  });
  it("handles leap days and month ends", () => {
    expect(monthRange("2028-02").end).toBe("2028-02-29");
    expect(monthRange("2026-02").end).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("counts calendar days including past dates", () => {
    expect(daysUntil("2026-09-21", "2026-09-20")).toBe(1);
    expect(daysUntil("2026-09-19", "2026-09-20")).toBe(-1);
    expect(daysUntil("2026-09-20", "2026-09-20")).toBe(0);
  });
  it("adds an approximate month count for events several months away", () => {
    expect(countdownLabel("2026-09-20", "2026-09-20")).toBe("今日");
    expect(countdownLabel("2026-11-18", "2026-09-20")).toBe("あと59日");
    expect(countdownLabel("2026-11-19", "2026-09-20")).toBe(
      "約2か月（あと60日）",
    );
    expect(countdownLabel("2026-12-21", "2026-09-20")).toBe(
      "約3か月（あと92日）",
    );
    expect(countdownLabel("2026-09-19", "2026-09-20")).toBe("1日前");
  });
});
