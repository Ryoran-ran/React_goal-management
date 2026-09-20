import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { base, initialize, save } from "./repository";
import {
  newLearningNote,
  newTheme,
  saveLearningNote,
  saveTheme,
} from "./learning";
import { createLessonSchedule, ensureLessonSchedules } from "./lessonSchedule";
import {
  backupCounts,
  createBackup,
  readBackup,
  restoreBackup,
} from "./backup";
import { backupTables } from "./backupValidation";
import { retireTechnicalGoals } from "./retireGoals";
import type { Lesson } from "../types";

const clear = () =>
  db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
beforeEach(clear);
afterAll(() => db.delete());
const source = (): Lesson => ({
  ...base(),
  date: "2026-09-20",
  title: "個人レッスン",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  completed: true,
  attachmentIds: [],
  sections: [
    {
      id: "rumba",
      category: "rumba",
      content: "太ももの使い方",
      feedback: "体重を乗せ切る",
      homework: "ゆっくり復習",
      youtubeUrls: ["https://youtu.be/dQw4w9WgXcQ"],
    },
  ],
});

// Re-sign modified manifests to test semantic validation independently of checksums.
async function changeManifest(
  blob: Blob,
  change: (manifest: Record<string, any>) => void,
) {
  const magicLength = new TextEncoder().encode("DANCE-NOTE-BACKUP\n").length;
  const headerSize = magicLength + 4 + 32;
  const header = new Uint8Array(await blob.slice(0, headerSize).arrayBuffer());
  const oldLength = new DataView(header.buffer).getUint32(magicLength);
  const manifest = JSON.parse(
    await blob.slice(headerSize, headerSize + oldLength).text(),
  );
  change(manifest);
  const next = new Blob([JSON.stringify(manifest)]);
  new DataView(header.buffer).setUint32(magicLength, next.size);
  header.set(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await next.arrayBuffer()),
    ),
    magicLength + 4,
  );
  return new Blob([header, next, blob.slice(headerSize + oldLength)]);
}

describe("full backup and restore", () => {
  it("round-trips every store, relationships, category media, thumbnails, YouTube and recurrence without changing IDs or timestamps", async () => {
    await initialize();
    const goal = {
      ...base(),
      title: "身体から踊る",
      category: "rumba" as const,
      status: "in_progress" as const,
      priority: "high" as const,
      progress: 25,
      eventIds: [],
    };
    await save("goals", goal);
    const event = {
      ...base(),
      title: "大会",
      date: "2026-10-20",
      type: "competition" as const,
      status: "planned" as const,
      goalIds: [goal.id],
    };
    await save("events", event);
    const theme = {
      ...newTheme(),
      title: "下半身",
      category: "ルンバ",
      goalIds: [goal.id],
      eventIds: [event.id],
    };
    await saveTheme(theme);
    const lesson = {
      ...source(),
      relatedEventIds: [event.id],
      relatedGoalIds: [goal.id],
    };
    await save(
      "lessons",
      lesson,
      [
        new File([new Uint8Array([0, 255, 128, 42])], "レッスン.mp4", {
          type: "video/mp4",
        }),
      ],
      [],
      ["rumba"],
    );
    const note = {
      ...newLearningNote(lesson.date, theme.id, {
        kind: "lesson",
        record: lesson,
      }),
      memo: "レッスン後のメモ",
      nextStep: "待つ",
      youtubeUrls: ["https://youtu.be/dQw4w9WgXcQ"],
    };
    await saveLearningNote(note, [
      new File(["日本語の画像データ"], "写真.png", { type: "image/png" }),
    ]);
    const noteFile = (await db.learningNotes.get(note.id))!.attachmentIds[0];
    await db.attachmentFiles.update(noteFile, {
      thumbnailBlob: new Blob(["thumbnail"], { type: "image/webp" }),
    });
    await save("practiceLogs", {
      ...base(),
      date: "2026-09-19",
      goalIds: [goal.id],
      practiced: true,
      note: "自主練習メモ",
      attachmentIds: [],
    });
    await save("monthlyPlans", {
      ...base(),
      year: 2026,
      month: 9,
      focusGoalIds: [goal.id],
      objectives: [],
      notes: "月の振り返り",
    });
    await save("weeklyPlans", {
      ...base(),
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      focusGoalIds: [goal.id],
      focusDetails: { [goal.id]: "足元を見る" },
      tasks: [
        { id: "task", title: "基礎練習", goalIds: [goal.id], completed: false },
      ],
    });
    await createLessonSchedule({
      title: "毎週のレッスン",
      startDate: "2026-09-21",
      endDate: "",
      weekdays: [1],
      excludedDates: ["2026-09-28"],
    });
    await db.settings.put({
      id: "lesson-custom-categories",
      value: ["身体づくり"],
    });
    await retireTechnicalGoals(true);
    const expected = await Promise.all(
      backupTables.map((name) => db.table(name).toArray()),
    );
    const file = await createBackup();
    const prepared = await readBackup(file);
    expect(
      backupCounts(prepared.tables).find((row) => row.name === "attachments")
        ?.count,
    ).toBe(2);
    await clear();
    await restoreBackup(prepared);
    for (const [index, name] of backupTables.entries()) {
      // JSON intentionally omits optional undefined properties.
      expect(
        JSON.parse(JSON.stringify(await db.table(name).toArray())),
      ).toEqual(JSON.parse(JSON.stringify(expected[index])));
    }
    const video = await db.attachmentFiles.get(
      (await db.lessons.get(lesson.id))!.attachmentIds[0],
    );
    expect(Array.from(new Uint8Array(await video!.blob.arrayBuffer()))).toEqual(
      [0, 255, 128, 42],
    );
    expect(video!.blob.type).toBe("video/mp4");
    expect(
      await (await db.attachmentFiles.get(noteFile))!.thumbnailBlob!.text(),
    ).toBe("thumbnail");
    expect(await (await db.attachmentFiles.get(noteFile))!.blob.text()).toBe(
      "日本語の画像データ",
    );
    await ensureLessonSchedules("2026-12-01");
    expect(await db.lessons.where("date").equals("2026-11-30").count()).toBe(1);
    expect(await db.lessons.where("date").equals("2026-09-28").count()).toBe(0);
  });

  it("replaces old data completely and repeated imports do not duplicate records", async () => {
    const original = source();
    await save("lessons", original);
    const backup = await readBackup(await createBackup());
    await saveLearningNote({
      ...newLearningNote("2026-09-21"),
      memo: "置き換え対象",
    });
    await save("lessons", source());
    await restoreBackup(backup);
    await restoreBackup(backup);
    expect(await db.lessons.count()).toBe(1);
    expect(await db.learningNotes.count()).toBe(0);
    expect((await db.lessons.toArray())[0].id).toBe(original.id);
  });

  it("exports and restores an empty database", async () => {
    const backup = await readBackup(await createBackup());
    expect(backupCounts(backup.tables).every((row) => row.count === 0)).toBe(
      true,
    );
    await restoreBackup(backup);
    expect(await db.lessons.count()).toBe(0);
  });

  it("leaves live records untouched during preview and when rejecting foreign or truncated files", async () => {
    await save("lessons", source());
    const file = await createBackup();
    await readBackup(file);
    await expect(readBackup(new Blob(["{}"]))).rejects.toThrow(".dancenote");
    await expect(readBackup(file.slice(0, file.size - 1))).rejects.toThrow();
    expect(await db.lessons.count()).toBe(1);
  });

  it("detects damaged metadata and video bytes", async () => {
    await save("lessons", source(), [
      new File(["video"], "video.mp4", { type: "video/mp4" }),
    ]);
    const bytes = new Uint8Array(await (await createBackup()).arrayBuffer());
    const damagedMetadata = bytes.slice();
    damagedMetadata[70] ^= 1;
    await expect(readBackup(new Blob([damagedMetadata]))).rejects.toThrow(
      "破損",
    );
    bytes[bytes.length - 1] ^= 1;
    await expect(readBackup(new Blob([bytes]))).rejects.toThrow(
      "画像・動画のデータが破損",
    );
  });

  it("rejects unsupported versions, missing stores and malformed record fields", async () => {
    await save("lessons", source());
    const file = await createBackup();
    for (const change of [
      (manifest: any) => {
        manifest.version = 99;
      },
      (manifest: any) => {
        delete manifest.tables.themes;
      },
      (manifest: any) => {
        manifest.tables.lessons[0].sections[0].feedback = 123;
      },
      (manifest: any) => {
        manifest.tables.lessons[0].date = "2026-02-31";
      },
      (manifest: any) => {
        manifest.tables.lessons.push(manifest.tables.lessons[0]);
      },
    ])
      await expect(
        readBackup(await changeManifest(file, change)),
      ).rejects.toThrow();
    expect(await db.lessons.count()).toBe(1);
  });

  it("rejects broken recurrence settings, duplicate unique dates and missing attachment relationships", async () => {
    await save("lessons", source(), [
      new File(["image"], "image.png", { type: "image/png" }),
    ]);
    await save("practiceLogs", {
      ...base(),
      date: "2026-09-20",
      goalIds: [],
      practiced: true,
      attachmentIds: [],
    });
    const file = await createBackup();
    for (const change of [
      (manifest: any) => {
        manifest.tables.settings.push({
          id: "ongoing-lesson-series:bad",
          value: {},
        });
      },
      (manifest: any) => {
        manifest.tables.practiceLogs.push({
          ...manifest.tables.practiceLogs[0],
          id: "other",
        });
      },
      (manifest: any) => {
        manifest.tables.attachments[0].relatedId = "missing";
      },
      (manifest: any) => {
        manifest.tables.attachments[0].sectionId = "missing";
      },
      (manifest: any) => {
        manifest.files = [];
      },
    ])
      await expect(
        readBackup(await changeManifest(file, change)),
      ).rejects.toThrow();
  });

  it("rolls back every table and media file if a write fails after clearing", async () => {
    await save("lessons", source());
    const backup = await readBackup(await createBackup());
    await clear();
    const keep = source();
    await save("lessons", keep, [
      new File(["keep me"], "keep.png", { type: "image/png" }),
    ]);
    await db.settings.put({ id: "keep-setting", value: "kept" });
    const before = (await db.lessons.get(keep.id))!;
    const fail = () => {
      throw new Error("simulated storage failure");
    };
    db.lessons.hook("creating", fail);
    try {
      await expect(restoreBackup(backup)).rejects.toThrow(
        "simulated storage failure",
      );
    } finally {
      db.lessons.hook("creating").unsubscribe(fail);
    }
    expect(await db.lessons.toArray()).toEqual([before]);
    expect(
      await (await db.attachmentFiles.get(
        before.attachmentIds[0],
      ))!.blob.text(),
    ).toBe("keep me");
    expect((await db.settings.get("keep-setting"))!.value).toBe("kept");
  });
});
