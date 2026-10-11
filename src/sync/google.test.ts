import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveScope } from "./google";

let google: typeof import("./google");
let callback: Parameters<
  NonNullable<Window["google"]>["accounts"]["oauth2"]["initTokenClient"]
>[0]["callback"];
let errorCallback: Parameters<
  NonNullable<Window["google"]>["accounts"]["oauth2"]["initTokenClient"]
>[0]["error_callback"];
const request = vi.fn();
const init = vi.fn((config) => {
  callback = config.callback;
  errorCallback = config.error_callback;
  return { requestAccessToken: request };
});
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv(
    "VITE_GOOGLE_CLIENT_ID",
    "public-client-id.apps.googleusercontent.com",
  );
  vi.stubGlobal("window", {
    setTimeout,
    google: {
      accounts: {
        oauth2: {
          initTokenClient: init,
          revoke: vi.fn((_token, done) => done({ successful: true })),
        },
      },
    },
  });
  google = await import("./google");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Google browser authentication", () => {
  it("requests permissions synchronously for the user gesture and keeps the token in the return value", async () => {
    await google.prepareGoogle();
    const result = google.authorizeGoogle();
    expect(request).toHaveBeenCalledWith({ prompt: "select_account" });
    expect(init.mock.calls[0][0]).toMatchObject({
      client_id: "public-client-id.apps.googleusercontent.com",
      include_granted_scopes: false,
    });
    expect(init.mock.calls[0][0].scope).toContain(driveScope);
    const now = Date.now();
    callback({
      access_token: "memory-only",
      scope: driveScope,
      expires_in: 3600,
    });
    expect(await result).toMatchObject({ token: "memory-only" });
    expect((await result).expiresAt).toBeGreaterThanOrEqual(now + 3_600_000);
  });
  it("rejects denied permissions, invalid expiration and a closed popup", async () => {
    const denied = google.authorizeGoogle();
    callback({ access_token: "token", scope: "email", expires_in: 3600 });
    await expect(denied).rejects.toThrow("許可されません");
    const invalid = google.authorizeGoogle();
    callback({ access_token: "token", scope: driveScope, expires_in: -1 });
    await expect(invalid).rejects.toThrow("許可されません");
    const closed = google.authorizeGoogle();
    errorCallback({ type: "popup_closed" });
    await expect(closed).rejects.toThrow("閉じられ");
  });
  it("requires a verified stable account identity and never puts a token in a URL", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          sub: "stable-id",
          email: "dancer@example.com",
          email_verified: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "stable-id",
          email: "dancer@example.com",
          email_verified: false,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await google.googleAccount("memory-only")).toEqual({
      id: "stable-id",
      email: "dancer@example.com",
    });
    expect(fetcher.mock.calls[0][0]).not.toContain("memory-only");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer memory-only",
    );
    await expect(google.googleAccount("memory-only")).rejects.toThrow(
      "確認できません",
    );
    await google.revokeGoogle("memory-only");
    expect(window.google!.accounts.oauth2.revoke).toHaveBeenCalled();
  });
  it("leaves Google integration unavailable when the public client ID is missing", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    vi.resetModules();
    const missing = await import("./google");
    await expect(missing.prepareGoogle()).rejects.toThrow("設定がありません");
    await expect(missing.authorizeGoogle()).rejects.toThrow("準備");
  });
});
