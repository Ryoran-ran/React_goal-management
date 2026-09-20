import { describe, it, expect } from "vitest";
import { addDays, daysUntil, monthRange, weekOf } from "./dates";
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
});
