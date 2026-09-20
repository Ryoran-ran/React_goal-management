import { db } from "./db";
import { retireTechnicalGoals } from "./retireGoals";
import type { AttachmentFile } from "../types";
import {
  backupTables,
  object,
  validateBackupRows,
  type BackupRows,
} from "./backupValidation";

const magic = new TextEncoder().encode("DANCE-NOTE-BACKUP\n");
const headerSize = magic.length + 4 + 32;
const maxManifestSize = 32 * 1024 * 1024;
interface Part {
  size: number;
  type: string;
  sha256: string;
}
interface FileEntry {
  id: string;
  blob: Part;
  thumbnailBlob?: Part;
}
interface Manifest {
  format: "dance-note";
  version: 1;
  databaseVersion: 3;
  exportedAt: string;
  tables: BackupRows;
  files: FileEntry[];
}
export interface PreparedBackup {
  exportedAt: string;
  tables: BackupRows;
  files: AttachmentFile[];
}
type Progress = (message: string) => void;
const digest = async (blob: Blob) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
  );
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const backupLabels = {
  lessons: "レッスンの予定・記録",
  practiceLogs: "自主練習の予定・記録",
  learningNotes: "学びのメモ",
  themes: "テーマ",
  events: "大会・イベント",
  weeklyPlans: "週の計画",
  monthlyPlans: "月の計画",
  attachments: "画像・動画",
  settings: "設定（繰り返しレッスンなど）",
} as const;
export const backupCounts = (tables: BackupRows) =>
  Object.entries(backupLabels).map(([name, label]) => ({
    name,
    label,
    count:
      name === "attachments"
        ? tables.attachments.filter((file) => file.relatedType !== "goal")
            .length
        : tables[name as keyof BackupRows].length,
  }));
export async function currentBackupCounts() {
  return Promise.all(
    Object.entries(backupLabels).map(async ([name, label]) => ({
      name,
      label,
      count: await db.table(name).count(),
    })),
  );
}

// Capture every table in one read transaction. Hashing and file work run outside it.
export async function createBackup(progress?: Progress): Promise<Blob> {
  progress?.("データをまとめています…");
  const snapshot = await db.transaction("r", db.tables, async () => {
    const tables = Object.fromEntries(
      await Promise.all(
        backupTables.map(async (name) => [
          name,
          await db.table(name).toArray(),
        ]),
      ),
    );
    return { tables, files: await db.attachmentFiles.toArray() };
  });
  validateBackupRows(snapshot.tables);
  validateMedia(snapshot.tables, snapshot.files);
  const blobs: Blob[] = [];
  const files: FileEntry[] = [];
  const part = async (blob: Blob): Promise<Part> => {
    const result = {
      size: blob.size,
      type: blob.type,
      sha256: hex(await digest(blob)),
    };
    blobs.push(blob);
    return result;
  };
  for (const [index, file] of snapshot.files.entries()) {
    progress?.(
      `画像・動画を準備しています… ${index + 1}/${snapshot.files.length}`,
    );
    files.push({
      id: file.id,
      blob: await part(file.blob),
      ...(file.thumbnailBlob
        ? { thumbnailBlob: await part(file.thumbnailBlob) }
        : {}),
    });
  }
  const manifest: Manifest = {
    format: "dance-note",
    version: 1,
    databaseVersion: 3,
    exportedAt: new Date().toISOString(),
    tables: snapshot.tables,
    files,
  };
  const metadata = new Blob([JSON.stringify(manifest)], {
    type: "application/json",
  });
  if (metadata.size > maxManifestSize)
    throw new Error(
      "記録の件数が多すぎるため、この形式ではエクスポートできません。",
    );
  const header = new Uint8Array(headerSize);
  header.set(magic);
  new DataView(header.buffer).setUint32(magic.length, metadata.size);
  header.set(await digest(metadata), magic.length + 4);
  return new Blob([header, metadata, ...blobs], {
    type: "application/octet-stream",
  });
}

const validPart = (value: unknown): value is Part =>
  object(value) &&
  typeof value.size === "number" &&
  Number.isSafeInteger(value.size) &&
  value.size >= 0 &&
  typeof value.type === "string" &&
  typeof value.sha256 === "string" &&
  /^[a-f0-9]{64}$/.test(value.sha256);
export async function readBackup(
  file: Blob,
  progress?: Progress,
): Promise<PreparedBackup> {
  progress?.("バックアップを確認しています…");
  const header = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
  if (
    header.length !== headerSize ||
    magic.some((byte, index) => byte !== header[index])
  )
    throw new Error(
      "このアプリからエクスポートした .dancenote ファイルを選んでください。",
    );
  const size = new DataView(header.buffer).getUint32(magic.length);
  if (!size || size > maxManifestSize || headerSize + size > file.size)
    throw new Error("バックアップが破損しているか、形式が正しくありません。");
  const metadata = file.slice(headerSize, headerSize + size);
  if (hex(await digest(metadata)) !== hex(header.slice(magic.length + 4)))
    throw new Error("バックアップの内容が破損しています。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await metadata.text());
  } catch {
    throw new Error("バックアップの内容を読み取れません。");
  }
  if (
    !object(parsed) ||
    parsed.format !== "dance-note" ||
    parsed.version !== 1 ||
    parsed.databaseVersion !== 3
  )
    throw new Error("このバージョンのバックアップには対応していません。");
  if (
    typeof parsed.exportedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.exportedAt)) ||
    !Array.isArray(parsed.files)
  )
    throw new Error("バックアップの情報が正しくありません。");
  validateBackupRows(parsed.tables);
  let offset = headerSize + size;
  const extract = async (part: unknown) => {
    if (!validPart(part) || part.size > file.size - offset)
      throw new Error("画像・動画のデータが不足しているか、破損しています。");
    const blob = file.slice(offset, offset + part.size, part.type);
    offset += part.size;
    if (hex(await digest(blob)) !== part.sha256)
      throw new Error("画像・動画のデータが破損しています。");
    return blob;
  };
  const files: AttachmentFile[] = [];
  for (const [index, entry] of parsed.files.entries()) {
    if (!object(entry) || typeof entry.id !== "string" || !entry.id)
      throw new Error("画像・動画の情報が正しくありません。");
    progress?.(
      `画像・動画を確認しています… ${index + 1}/${parsed.files.length}`,
    );
    files.push({
      id: entry.id,
      blob: await extract(entry.blob),
      ...(entry.thumbnailBlob !== undefined
        ? { thumbnailBlob: await extract(entry.thumbnailBlob) }
        : {}),
    });
  }
  if (offset !== file.size)
    throw new Error("バックアップのファイルサイズが一致しません。");
  validateMedia(parsed.tables, files);
  return { exportedAt: parsed.exportedAt, tables: parsed.tables, files };
}

function validateMedia(tables: BackupRows, files: AttachmentFile[]) {
  const byId = new Map(files.map((file) => [file.id, file]));
  if (byId.size !== files.length || files.length !== tables.attachments.length)
    throw new Error("画像・動画の件数が一致しません。");
  const owners = {
    lesson: "lessons",
    practice: "practiceLogs",
    event: "events",
    goal: "goals",
    learning: "learningNotes",
  } as const;
  for (const attachment of tables.attachments) {
    const file = byId.get(attachment.id as string);
    if (
      !file ||
      file.blob.size !== attachment.size ||
      file.blob.type !== attachment.mimeType
    )
      throw new Error("画像・動画の原本と情報が一致しません。");
    const table = owners[attachment.relatedType as keyof typeof owners];
    const owner = tables[table].find((row) => row.id === attachment.relatedId);
    if (!owner) throw new Error("画像・動画の関連先が見つかりません。");
    if (
      attachment.sectionId &&
      (table !== "lessons" ||
        !Array.isArray(owner.sections) ||
        !owner.sections.some((section) => section.id === attachment.sectionId))
    )
      throw new Error("画像・動画のカテゴリが見つかりません。");
  }
  for (const [kind, table] of Object.entries(owners)) {
    for (const row of tables[table]) {
      if (!Array.isArray(row.attachmentIds)) continue;
      for (const id of row.attachmentIds)
        if (
          !tables.attachments.some(
            (file) =>
              file.id === id &&
              file.relatedType === kind &&
              file.relatedId === row.id,
          )
        )
          throw new Error("記録に対応する画像・動画が不足しています。");
    }
  }
}

export async function restoreBackup(backup: PreparedBackup) {
  validateBackupRows(backup.tables);
  validateMedia(backup.tables, backup.files);
  // Clearing and restoring is atomic: quota/constraint failures roll back everything.
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const name of backupTables)
      await db.table(name).bulkAdd(backup.tables[name]);
    await db.attachmentFiles.bulkAdd(backup.files);
    await retireTechnicalGoals(true);
  });
}

export function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dance-note-${new Date().toISOString().replace(/[:.]/g, "-")}.dancenote`;
  document.body.append(link);
  link.click();
  link.remove();
  // Give browsers time to begin the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
