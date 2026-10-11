export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
}
export const maxDriveFileBytes = 512 * 1024 * 1024;
export interface DriveTransport {
  list(): Promise<DriveFile[]>;
  download(file: DriveFile, maxBytes?: number): Promise<Blob>;
  create(name: string, data: Blob): Promise<DriveFile>;
}
export class AuthenticationRequired extends Error {
  constructor() {
    super(
      "Googleの認証が切れています。「Googleアカウントを再連携」してください。",
    );
  }
}
export class GoogleDrive implements DriveTransport {
  constructor(private readonly token: () => string) {}
  private async request(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    let last: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this.token()}`,
        },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return response;
      if (response.status === 401) throw new AuthenticationRequired();
      const error = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { error?: { errors?: { reason: string }[] } };
      const reasons = error.error?.errors?.map((item) => item.reason) ?? [];
      if (reasons.includes("storageQuotaExceeded"))
        throw new Error(
          "Google Driveの空き容量が不足しています。ローカルの変更は保存されています。",
        );
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        reasons.some((r) =>
          ["rateLimitExceeded", "userRateLimitExceeded"].includes(r),
        );
      if (!retryable || attempt === 3)
        throw new Error(
          `Google Driveと通信できませんでした（${response.status}）。時間をおいて再試行してください。`,
        );
      last = response;
      const retryAfter = Number(response.headers.get("Retry-After")) * 1000;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(
            15_000,
            retryAfter || 1000 * 2 ** attempt + Math.random() * 500,
          ),
        ),
      );
    }
    throw new Error(`Google Driveと通信できませんでした（${last?.status}）。`);
  }
  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    const pages = new Set<string>();
    do {
      const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: "trashed = false and name contains 'dance-note-'",
        pageSize: "1000",
        fields: "nextPageToken,files(id,name,createdTime,modifiedTime,size)",
      });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await this.request(
        `https://www.googleapis.com/drive/v3/files?${query}`,
      );
      const page = (await response.json()) as {
        files: DriveFile[];
        nextPageToken?: string;
      };
      if (
        !Array.isArray(page.files) ||
        page.files.some(
          (file) =>
            typeof file.id !== "string" ||
            !file.id ||
            typeof file.name !== "string" ||
            !file.name ||
            typeof file.createdTime !== "string",
        ) ||
        (page.nextPageToken !== undefined &&
          (typeof page.nextPageToken !== "string" ||
            pages.has(page.nextPageToken)))
      )
        throw new Error("Google Driveのファイル一覧が不正です。");
      if (page.nextPageToken) pages.add(page.nextPageToken);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }
  async download(file: DriveFile, maxBytes = maxDriveFileBytes): Promise<Blob> {
    maxBytes = Math.min(maxBytes, maxDriveFileBytes);
    if (file.size && Number(file.size) > maxBytes)
      throw new Error(
        "同期ファイルが大きすぎます。ローカルのデータは保持されています。",
      );
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    );
    // Bound the stream too: metadata and Content-Length can be absent or stale.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("同期ファイルを読み込めませんでした。");
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) throw new Error("同期ファイルが大きすぎます。");
        parts.push(new Uint8Array(chunk.value));
      }
    } finally {
      await reader.cancel();
    }
    return new Blob(parts, {
      type: response.headers.get("Content-Type") ?? "application/octet-stream",
    });
  }
  async create(name: string, data: Blob): Promise<DriveFile> {
    if (data.size > maxDriveFileBytes)
      throw new Error(
        "同期ファイルが大きすぎます（上限512 MiB）。ローカルのデータは保持されています。",
      );
    const metadata = { name, parents: ["appDataFolder"] };
    const boundary = `dance-note-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${data.type || "application/octet-stream"}\r\n\r\n`,
      data,
      `\r\n--${boundary}--`,
    ]);
    const response = await this.request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const file = (await response.json()) as DriveFile;
    if (
      typeof file.id !== "string" ||
      !file.id ||
      file.name !== name ||
      typeof file.createdTime !== "string"
    )
      throw new Error(
        "Google Driveへの保存結果を確認できませんでした。変更履歴は保持しています。",
      );
    return file;
  }
}
export const sha256 = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
