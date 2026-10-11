import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequired, GoogleDrive } from "./drive";
const file = {
  id: "file-id",
  name: "dance-note-events-batch",
  createdTime: "2026-10-11T00:00:00Z",
  size: "3",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Google Drive HTTP adapter", () => {
  it("paginates only appDataFolder and sends credentials in the authorization header", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ files: [file], nextPageToken: "page2" }),
      )
      .mockResolvedValueOnce(Response.json({ files: [] }));
    vi.stubGlobal("fetch", fetcher);
    const drive = new GoogleDrive(() => "test-token");
    expect(await drive.list()).toEqual([file]);
    const first = new URL(fetcher.mock.calls[0][0]);
    expect(first.searchParams.get("spaces")).toBe("appDataFolder");
    expect(
      new URL(fetcher.mock.calls[1][0]).searchParams.get("pageToken"),
    ).toBe("page2");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer test-token",
    );
    expect(first.toString()).not.toContain("test-token");
  });
  it("creates immutable files with appDataFolder metadata and raw binary content", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(file));
    vi.stubGlobal("fetch", fetcher);
    const drive = new GoogleDrive(() => "test-token");
    await drive.create(file.name, new Blob(["abc"], { type: "image/png" }));
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(options.method).toBe("POST");
    const body = await (options.body as Blob).text();
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain("abc");
    expect(body).not.toContain("test-token");
  });
  it("requests reauthorization on 401 and reports storage quota failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 401 }))
        .mockResolvedValueOnce(
          Response.json(
            { error: { errors: [{ reason: "storageQuotaExceeded" }] } },
            { status: 403 },
          ),
        ),
    );
    const drive = new GoogleDrive(() => "token");
    await expect(drive.list()).rejects.toBeInstanceOf(AuthenticationRequired);
    await expect(drive.list()).rejects.toThrow("空き容量");
  });
  it("backs off and retries rate limits", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({}, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(Response.json({ files: [] }));
    vi.stubGlobal("fetch", fetcher);
    const result = new GoogleDrive(() => "token").list();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds both declared file size and streamed bytes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("too large"));
    vi.stubGlobal("fetch", fetcher);
    const drive = new GoogleDrive(() => "token");
    await expect(drive.download({ ...file, size: "100" }, 3)).rejects.toThrow(
      "大きすぎ",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      drive.download({ ...file, size: undefined }, 3),
    ).rejects.toThrow("大きすぎ");
  });
  it("rejects repeated page tokens and unconfirmed upload responses", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ files: [], nextPageToken: "repeated" }),
      );
    vi.stubGlobal("fetch", fetcher);
    const drive = new GoogleDrive(() => "token");
    await expect(drive.list()).rejects.toThrow("一覧が不正");
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValue(Response.json({ ...file, name: "different" }));
    await expect(drive.create(file.name, new Blob(["abc"]))).rejects.toThrow(
      "保存結果",
    );
  });
});
