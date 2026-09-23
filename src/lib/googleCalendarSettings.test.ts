import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultGoogleCalendarName,
  readGoogleCalendarName,
  saveGoogleCalendarName,
} from "./googleCalendarSettings";

afterEach(() => vi.unstubAllGlobals());

describe("Googleカレンダーの初期登録先", () => {
  it("保存した名前を次回の初期値として読み込む", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(readGoogleCalendarName()).toBe(defaultGoogleCalendarName);
    expect(saveGoogleCalendarName("  ダンス予定  ")).toBe("ダンス予定");
    expect(readGoogleCalendarName()).toBe("ダンス予定");
  });

  it("空のカレンダー名は保存しない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
    });
    expect(() => saveGoogleCalendarName("   ")).toThrow("200文字以内");
  });
});
