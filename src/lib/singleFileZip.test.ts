import { describe, expect, it } from "vitest";
import {
  createSingleFileZip,
  isZipFile,
  readSingleFileZip,
} from "./singleFileZip";

describe("single-file ZIP", () => {
  it("stores and reads a UTF-8 named file without changing its bytes", async () => {
    const source = new Blob([
      "DanceNoteのバックアップ",
      new Uint8Array([0, 1, 255]),
    ]);
    const archive = await createSingleFileZip("バックアップ.dat", source);
    expect(archive.type).toBe("application/zip");
    expect(await isZipFile(archive)).toBe(true);
    const restored = await readSingleFileZip(archive);
    expect(restored.name).toBe("バックアップ.dat");
    expect(new Uint8Array(await restored.file.arrayBuffer())).toEqual(
      new Uint8Array(await source.arrayBuffer()),
    );
  });

  it("rejects damaged contents and files that are not a supported ZIP", async () => {
    const archive = new Uint8Array(
      await (
        await createSingleFileZip("backup.dat", new Blob(["data"]))
      ).arrayBuffer(),
    );
    archive[31] ^= 1;
    await expect(readSingleFileZip(new Blob([archive]))).rejects.toThrow();
    await expect(readSingleFileZip(new Blob(["not a zip"]))).rejects.toThrow();
    expect(await isZipFile(new Blob(["not a zip"]))).toBe(false);
  });
});
