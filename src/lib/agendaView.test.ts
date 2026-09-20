import { afterEach, describe, expect, it, vi } from "vitest";
import { readAgendaView, saveAgendaView } from "./agendaView";

afterEach(() => vi.unstubAllGlobals());

describe("saved agenda display mode", () => {
  it("restores the last selected mode on subsequent reads", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    expect(readAgendaView()).toBe("month");
    saveAgendaView("day");
    expect(readAgendaView()).toBe("day");
    saveAgendaView("month");
    expect(readAgendaView()).toBe("month");
  });

  it("uses the default for invalid or unavailable browser storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "invalid" });
    expect(readAgendaView()).toBe("month");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage blocked");
      },
      setItem: () => {
        throw new Error("Storage blocked");
      },
    });
    expect(readAgendaView()).toBe("month");
    expect(() => saveAgendaView("day")).not.toThrow();
  });
});
