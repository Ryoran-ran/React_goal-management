import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import { defaultDevice, silenceJournal } from "./journal";
import { InvalidSyncData } from "./model";
vi.mock("./google", () => ({
  authorizeGoogle: vi.fn(async () => ({
    token: "test-token-never-persisted",
    expiresAt: Date.now() + 3_600_000,
  })),
  googleAccount: vi.fn(async () => ({
    id: "account",
    email: "test@example.com",
  })),
  revokeGoogle: vi.fn(async () => {}),
}));
import { authorizeGoogle } from "./google";
import {
  connectGoogle,
  disconnectGoogle,
  startAutoSync,
  syncEngine,
  syncNow,
  syncView,
} from "./service";
let stop: (() => void) | undefined;
const realSetTimeout = setTimeout;
const flush = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise<void>((resolve) => realSetTimeout(resolve, 0));
};
beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  await db.open();
  await db.transaction("rw", db.tables, async () => {
    silenceJournal();
    for (const table of db.tables) await table.clear();
  });
  await db.syncMeta.put({
    ...defaultDevice(),
    autoSync: false,
    initializedCloud: true,
  });
  vi.spyOn(syncEngine, "sync").mockResolvedValue();
  await connectGoogle();
  await db.syncMeta.update("device", { autoSync: true });
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  });
});
afterEach(async () => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  await disconnectGoogle();
  await db.delete();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("automatic synchronization", () => {
  it("debounces edits, runs periodically and resumes when online or visible", async () => {
    stop = startAutoSync();
    await flush();
    await db.settings.put({ id: "lesson-custom-categories", value: ["振付"] });
    await flush();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(syncEngine.sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(syncEngine.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await flush();
    expect(syncEngine.sync).toHaveBeenCalledTimes(2);
    Object.assign(navigator, { onLine: false });
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(syncEngine.sync).toHaveBeenCalledTimes(2);
    Object.assign(navigator, { onLine: true });
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(syncEngine.sync).toHaveBeenCalledTimes(3);
    Object.assign(document, { visibilityState: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(syncEngine.sync).toHaveBeenCalledTimes(3);
    Object.assign(document, { visibilityState: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(syncEngine.sync).toHaveBeenCalledTimes(4);
  });
  it("does not open background authorization and stops at token expiration", async () => {
    stop = startAutoSync();
    await flush();
    await vi.advanceTimersByTimeAsync(3_600_000);
    await flush();
    expect(syncView().authorized).toBe(false);
    expect(authorizeGoogle).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(syncEngine.sync).mock.calls.length;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(syncEngine.sync).toHaveBeenCalledTimes(calls);
    await syncNow();
    expect(syncView().error).toContain("認証");
    expect(JSON.stringify(await db.syncMeta.toArray())).not.toContain(
      "test-token-never-persisted",
    );
    expect(JSON.stringify(await db.settings.toArray())).not.toContain(
      "test-token-never-persisted",
    );
  });
  it("persists invalid-data blocking and preserves local data after disconnect", async () => {
    vi.mocked(syncEngine.sync).mockRejectedValueOnce(
      new InvalidSyncData("corrupt"),
    );
    await syncNow();
    expect((await db.syncMeta.get("device"))?.blocked).toBe(true);
    stop = startAutoSync();
    await flush();
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(syncEngine.sync).toHaveBeenCalledTimes(1);
    await db.settings.put({ id: "lesson-custom-categories", value: ["残す"] });
    await disconnectGoogle();
    expect((await db.settings.get("lesson-custom-categories"))?.value).toEqual([
      "残す",
    ]);
    expect(await db.syncEvents.where("status").equals("pending").count()).toBe(
      1,
    );
    expect((await db.syncMeta.get("device"))?.account?.id).toBe("account");
    expect(syncView().authorized).toBe(false);
  });
});
