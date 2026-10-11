import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DanceDatabase } from "../data/db";
import type { Lesson } from "../types";
import { SyncEngine } from "./engine";
import { applyEvents, resolveConflict } from "./merge";
import { deviceState, seedJournal, silenceJournal } from "./journal";
import {
  makeEvent,
  materialize,
  recordKey,
  wireEvent,
  type Row,
} from "./model";
import type { DriveFile, DriveTransport } from "./drive";
import { readSnapshot, restoreLocalSafetyCopy } from "./snapshot";

class MemoryDrive implements DriveTransport {
  files = new Map<string, { file: DriveFile; blob: Blob }>();
  loseNextBatchResponse = false;
  failDownloads = false;
  async list() {
    return [...this.files.values()].map((item) => item.file);
  }
  async create(name: string, blob: Blob) {
    const time = new Date(Date.now() + this.files.size).toISOString();
    const file = {
      id: crypto.randomUUID(),
      name,
      createdTime: time,
      modifiedTime: time,
      size: String(blob.size),
    };
    this.files.set(file.id, { file, blob });
    if (this.loseNextBatchResponse && name.startsWith("dance-note-events-")) {
      this.loseNextBatchResponse = false;
      throw new Error("lost response");
    }
    return file;
  }
  downloads: string[] = [];
  async download(file: DriveFile) {
    this.downloads.push(file.id);
    if (this.failDownloads) throw new Error("offline");
    return this.files.get(file.id)!.blob;
  }
}
const databases: DanceDatabase[] = [];
const database = () => {
  const db = new DanceDatabase(`sync-test-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
};
const lesson = (id = crypto.randomUUID()): Lesson => ({
  id,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  title: "ルンバ",
  date: "2026-10-11",
  relatedEventIds: [],
  relatedGoalIds: [],
  plannedTopics: [],
  actualTopics: [],
  attachmentIds: [],
  completed: false,
});
const engine = async (db: DanceDatabase, drive: MemoryDrive) => {
  const result = new SyncEngine(db, drive);
  await result.bindAccount({ id: "account-1", email: "dancer@example.com" });
  return result;
};
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("durable local journal", () => {
  it("serializes parallel writes inside the same physical transaction", async () => {
    const db = database(),
      row = lesson();
    await db.lessons.put(row);
    await db.transaction("rw", db.lessons, async () => {
      await Promise.all([
        db.lessons.put({ ...row, title: "first" }),
        db.lessons.put({ ...row, title: "second" }),
      ]);
    });
    const events = await db.syncEvents
      .where("[recordType+recordId]")
      .equals(["lessons", row.id])
      .toArray();
    expect(materialize(events).fields).toEqual([]);
    expect(materialize(events).row?.title).toBe("second");
    expect(new Set(events.map((event) => event.deviceId)).size).toBe(1);
  });
  it("journals put, update, modify, bulk delete and clear without changing existing APIs", async () => {
    const db = database(),
      row = lesson();
    await db.lessons.put(row);
    await db.lessons.update(row.id, { homework: "復習" });
    await db.lessons.toCollection().modify({ teacherFeedback: "膝を伸ばす" });
    await db.lessons.bulkDelete([row.id]);
    await db.lessons.bulkAdd([lesson(), lesson()]);
    await db.lessons.clear();
    const events = await db.syncEvents.toArray();
    expect(
      events
        .filter((event) => event.recordId === row.id)
        .map((event) => event.operation)
        .sort(),
    ).toEqual(["create", "delete", "update", "update"]);
    expect(events.filter((event) => event.operation === "delete")).toHaveLength(
      3,
    );
    expect(new Set(events.map((event) => event.eventId)).size).toBe(
      events.length,
    );
    expect(events.every((event) => event.status === "pending")).toBe(true);
  });
  it("rolls back the record and its history together when a transaction fails", async () => {
    const db = database(),
      row = lesson();
    await expect(
      db.transaction("rw", db.lessons, async () => {
        await db.lessons.add(row);
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    expect(await db.lessons.count()).toBe(0);
    expect(await db.syncEvents.count()).toBe(0);
  });
  it("seeds v3 records and does not upload migration markers or browser settings", async () => {
    const db = database(),
      row = lesson();
    await db.transaction("rw", db.tables, async () => {
      silenceJournal();
      await db.lessons.add(row);
    });
    await db.settings.put({ id: "initialized", value: true });
    await db.settings.put({ id: "lesson-custom-categories", value: ["振付"] });
    await seedJournal(db);
    await seedJournal(db);
    expect(
      (await db.syncEvents.toArray()).map((event) => event.recordType).sort(),
    ).toEqual(["lessons", "settings"]);
  });
  it("preserves offline edits and their events after closing and reopening", async () => {
    const db = database(),
      row = lesson();
    await db.lessons.put(row);
    await db.lessons.update(row.id, { homework: "オフライン練習" });
    db.close();
    await db.open();
    expect((await db.lessons.get(row.id))?.homework).toBe("オフライン練習");
    expect(await db.syncEvents.where("status").equals("pending").count()).toBe(
      2,
    );
  });
  it("archives attachment originals even when removed before the first upload", async () => {
    const db = database();
    await db.attachmentFiles.put({
      id: "image",
      blob: new Blob(["original"], { type: "image/png" }),
    });
    await db.attachmentFiles.delete("image");
    expect(await (await db.syncMedia.get("image"))?.blob.text()).toBe(
      "original",
    );
  });
});

describe("causal merging", () => {
  it("retains referenced attachments while the parent deletion is conflicted", async () => {
    const a = database(),
      b = database(),
      row = lesson();
    row.attachmentIds = ["image"];
    await a.lessons.put(row);
    await a.attachments.put({
      id: "image",
      name: "photo.png",
      mimeType: "image/png",
      size: 8,
      relatedType: "lesson",
      relatedId: row.id,
      createdAt: row.createdAt,
    });
    const file = {
      id: "image",
      blob: new Blob(["original"], { type: "image/png" }),
    };
    await a.attachmentFiles.put(file);
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent), [file]);
    await a.lessons.delete(row.id);
    await a.attachments.delete("image");
    await b.lessons.update(row.id, { homework: "残す" });
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent));
    const conflict = (await b.syncConflicts.toArray()).find(
      (item) => item.recordType === "attachments",
    )!;
    expect(conflict.reason).toBe("relation");
    await expect(
      resolveConflict(b, conflict.key, null, conflict.eventIds),
    ).rejects.toThrow("先に解決");
    expect(await b.attachments.get("image")).toBeDefined();
    expect(await (await b.attachmentFiles.get("image"))?.blob.text()).toBe(
      "original",
    );
  });
  it("preserves non-conflicting fields when choosing one side and handles descendant-first input", async () => {
    const row = lesson() as unknown as Row,
      root = makeEvent("lessons", row.id, null, row, "phone", []);
    const a = makeEvent(
      "lessons",
      row.id,
      row,
      { ...row, title: "スマホ" },
      "phone",
      [root.eventId],
    );
    const afterA = { ...row, title: "スマホ" };
    const aa = makeEvent(
      "lessons",
      row.id,
      afterA,
      { ...afterA, homework: "復習" },
      "phone",
      [a.eventId],
    );
    const b = makeEvent(
      "lessons",
      row.id,
      row,
      { ...row, title: "PC", teacherFeedback: "残す" },
      "pc",
      [root.eventId],
    );
    const db = database();
    await applyEvents(db, [aa, b, a, root]);
    const conflict = (await db.syncConflicts.toArray())[0];
    expect(conflict.fields).toEqual(["title"]);
    expect(conflict.merged).toMatchObject({
      homework: "復習",
      teacherFeedback: "残す",
    });
  });
  it("merges independent fields in either arrival order, without timestamp winner selection", async () => {
    const row = lesson() as unknown as Row;
    const root = makeEvent("lessons", row.id, null, row, "phone", []);
    const a = makeEvent(
      "lessons",
      row.id,
      row,
      { ...row, homework: "スマホ" },
      "phone",
      [root.eventId],
    );
    const b = makeEvent(
      "lessons",
      row.id,
      row,
      { ...row, teacherFeedback: "PC" },
      "pc",
      [root.eventId],
    );
    for (const events of [
      [root, a, b],
      [b, a, root],
    ]) {
      expect(materialize(events).fields).toEqual([]);
      expect(materialize(events).row).toMatchObject({
        homework: "スマホ",
        teacherFeedback: "PC",
      });
    }
  });
  it("detects same-field conflicts and records a durable resolution", async () => {
    const a = database(),
      b = database(),
      row = lesson();
    await a.lessons.put(row);
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent));
    await a.lessons.update(row.id, { homework: "スマホ" });
    await b.lessons.update(row.id, { homework: "PC" });
    await applyEvents(a, (await b.syncEvents.toArray()).map(wireEvent));
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent));
    const conflict = (await a.syncConflicts.toArray())[0];
    expect(conflict.fields).toContain("homework");
    expect((await a.lessons.get(row.id))?.homework).toBe("スマホ");
    await expect(
      a.lessons.update(row.id, { homework: "上書き" }),
    ).rejects.toThrow("競合");
    await resolveConflict(
      a,
      conflict.key,
      { ...row, homework: "両方を確認" } as unknown as Row,
      conflict.eventIds,
    );
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent));
    expect(await b.syncConflicts.count()).toBe(0);
    expect((await b.lessons.get(row.id))?.homework).toBe("両方を確認");
    expect(
      (await a.syncEvents.toArray()).some(
        (event) => event.operation === "resolve" && event.status === "pending",
      ),
    ).toBe(true);
  });
  it("detects delete versus edit and never discards either event", async () => {
    const a = database(),
      b = database(),
      row = lesson();
    await a.lessons.put(row);
    await applyEvents(b, (await a.syncEvents.toArray()).map(wireEvent));
    await a.lessons.delete(row.id);
    await b.lessons.update(row.id, { homework: "変更" });
    await applyEvents(a, (await b.syncEvents.toArray()).map(wireEvent));
    expect((await a.syncConflicts.toArray())[0].fields).toContain("$record");
    expect(await a.syncEvents.count()).toBe(3);
  });
  it("deduplicates replay and rejects event-ID collisions atomically", async () => {
    const a = database(),
      b = database(),
      row = lesson();
    await a.lessons.put(row);
    const events = (await a.syncEvents.toArray()).map(wireEvent);
    await applyEvents(b, events);
    await applyEvents(b, events);
    expect(await b.syncEvents.count()).toBe(1);
    const changed = { ...events[0], deviceId: "tampered" };
    await expect(applyEvents(b, [changed])).rejects.toThrow("イベントID");
    expect(await b.lessons.get(row.id)).toMatchObject(row);
  });
  it("rejects broken ancestry and malformed rows before applying anything", async () => {
    const db = database(),
      row = lesson() as unknown as Row;
    const valid = makeEvent("lessons", row.id, null, row, "phone", []);
    const broken = makeEvent(
      "lessons",
      row.id,
      row,
      { ...row, homework: "bad" },
      "phone",
      ["missing"],
    );
    await expect(applyEvents(db, [valid, broken])).rejects.toThrow("参照");
    expect(await db.lessons.count()).toBe(0);
    expect(await db.syncEvents.count()).toBe(0);
    await expect(
      applyEvents(db, [{ ...valid, after: { id: row.id } }]),
    ).rejects.toThrow();
    expect(await db.syncEvents.count()).toBe(0);
  });
  it("retains separately created records with the same unique date as an explicit conflict", async () => {
    const a = database(),
      b = database();
    const common = {
      createdAt: "2026-10-11T00:00:00Z",
      updatedAt: "2026-10-11T00:00:00Z",
      date: "2026-10-11",
      goalIds: [],
      practiced: true,
      attachmentIds: [],
    };
    await a.practiceLogs.put({ ...common, id: "a", note: "スマホ" });
    await b.practiceLogs.put({ ...common, id: "b", note: "PC" });
    await applyEvents(a, (await b.syncEvents.toArray()).map(wireEvent));
    expect(await a.syncEvents.count()).toBe(2);
    expect((await a.syncConflicts.toArray())[0].reason).toBe("unique");
  });
});

describe("Drive synchronization and recovery", () => {
  it("bootstraps from snapshot receipts without downloading covered event files again", async () => {
    const a = database(),
      b = database(),
      drive = new MemoryDrive(),
      ea = await engine(a, drive),
      eb = await engine(b, drive);
    const row = lesson();
    await a.lessons.put(row);
    await ea.sync(true);
    await ea.snapshot();
    drive.downloads = [];
    await eb.sync(true);
    const batches = (await drive.list()).filter((file) =>
      file.name.startsWith("dance-note-events-"),
    );
    expect(batches.every((file) => !drive.downloads.includes(file.id))).toBe(
      true,
    );
    expect(await b.lessons.get(row.id)).toMatchObject(row);
  });
  it("rejects modified acknowledged history without changing local records", async () => {
    const db = database(),
      drive = new MemoryDrive(),
      e = await engine(db, drive),
      row = lesson();
    await db.lessons.put(row);
    await e.sync(true);
    const stored = [...drive.files.values()].find((item) =>
      item.file.name.startsWith("dance-note-events-"),
    )!;
    const batch = JSON.parse(await stored.blob.text());
    batch.events[0].deviceName = "改変";
    stored.blob = new Blob([JSON.stringify(batch)], {
      type: "application/json",
    });
    stored.file.modifiedTime = new Date(
      Date.parse(stored.file.modifiedTime!) + 1000,
    ).toISOString();
    await expect(e.sync()).rejects.toThrow("書き換え");
    expect(await db.lessons.get(row.id)).toMatchObject(row);
  });
  it("uploads causal prefixes across several batches and restores local safety copies offline", async () => {
    const db = database(),
      drive = new MemoryDrive(),
      e = await engine(db, drive),
      row = lesson();
    await db.lessons.put(row);
    for (let index = 0; index < 205; index++)
      await db.lessons.update(row.id, { homework: String(index) });
    await e.sync(true);
    const batches = (await drive.list())
      .filter((file) => file.name.startsWith("dance-note-events-"))
      .sort((a, b) => a.createdTime.localeCompare(b.createdTime));
    expect(batches).toHaveLength(3);
    const received = new Set<string>();
    for (const file of batches) {
      const batch = JSON.parse(await (await drive.download(file)).text());
      for (const event of batch.events) {
        expect(event.baseRevision.every((id: string) => received.has(id))).toBe(
          true,
        );
        received.add(event.eventId);
      }
    }
    const old = (await db.syncSnapshots.toArray())[0];
    await db.lessons.update(row.id, { homework: "新しい内容" });
    drive.failDownloads = true;
    await restoreLocalSafetyCopy(db, old.blob);
    expect((await db.lessons.get(row.id))?.homework).toBe("204");
  });
  it("shares phone creations, PC edits and distinct offline records in both directions", async () => {
    const drive = new MemoryDrive(),
      phone = database(),
      pc = database();
    const a = await engine(phone, drive),
      b = await engine(pc, drive);
    const row = lesson();
    await phone.lessons.put(row);
    await a.sync(true);
    await b.sync(true);
    expect(await pc.lessons.get(row.id)).toMatchObject(row);
    await pc.lessons.update(row.id, { homework: "PCから編集" });
    await b.sync();
    await a.sync();
    expect((await phone.lessons.get(row.id))?.homework).toBe("PCから編集");
    const extraA = lesson(),
      extraB = lesson();
    await phone.lessons.put(extraA);
    await pc.lessons.put(extraB);
    await Promise.all([a.sync(), b.sync()]);
    await Promise.all([a.sync(), b.sync()]);
    expect(await phone.lessons.count()).toBe(3);
    expect(await pc.lessons.count()).toBe(3);
  });
  it("recovers a lost upload response without losing pending events or applying twice", async () => {
    const db = database(),
      drive = new MemoryDrive(),
      a = await engine(db, drive);
    await a.sync(true);
    const row = lesson();
    await db.lessons.put(row);
    drive.loseNextBatchResponse = true;
    await expect(a.sync()).rejects.toThrow("lost response");
    expect(await db.syncEvents.where("status").equals("pending").count()).toBe(
      1,
    );
    db.close();
    await db.open();
    await a.sync();
    expect(await db.syncEvents.where("status").equals("pending").count()).toBe(
      0,
    );
    const pc = database(),
      b = await engine(pc, drive);
    await b.sync(true);
    expect(await pc.lessons.count()).toBe(1);
    expect(
      (await drive.list()).filter((file) =>
        file.name.startsWith("dance-note-events-"),
      ),
    ).toHaveLength(1);
  });
  it("retains data when disconnected and rejects another account", async () => {
    const db = database(),
      drive = new MemoryDrive(),
      a = await engine(db, drive);
    const row = lesson();
    await db.lessons.put(row);
    await expect(
      a.bindAccount({ id: "account-2", email: "other@example.com" }),
    ).rejects.toThrow("別アカウント");
    expect(await db.lessons.get(row.id)).toMatchObject(row);
    expect((await deviceState(db)).account?.id).toBe("account-1");
  });
  it("transfers originals and keeps multiple verified snapshots", async () => {
    const a = database(),
      b = database(),
      drive = new MemoryDrive(),
      ea = await engine(a, drive),
      eb = await engine(b, drive);
    const row = lesson();
    row.attachmentIds = ["image"];
    await a.transaction("rw", a.tables, async () => {
      await a.lessons.put(row);
      await a.attachments.add({
        id: "image",
        name: "photo.png",
        mimeType: "image/png",
        size: 8,
        relatedType: "lesson",
        relatedId: row.id,
        createdAt: row.createdAt,
      });
      await a.attachmentFiles.put({
        id: "image",
        blob: new Blob(["original"], { type: "image/png" }),
      });
    });
    await ea.sync(true);
    await eb.sync(true);
    expect(await (await b.attachmentFiles.get("image"))?.blob.text()).toBe(
      "original",
    );
    await ea.snapshot();
    const snapshots = await ea.backups();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const snapshot = await ea.previewBackup(snapshots[0]);
    expect(snapshot.manifest.appliedEventIds.length).toBe(2);
    const blob = drive.files.get(snapshots[0].id)!.blob;
    await expect(
      readSnapshot(
        new Blob([await blob.slice(0, 30).arrayBuffer(), "damage"]),
        "account-1",
      ),
    ).rejects.toThrow();
    await expect(readSnapshot(blob, "account-2")).rejects.toThrow("アカウント");
  });
  it("restores old values as new events and preserves newer unrelated local records", async () => {
    const db = database(),
      drive = new MemoryDrive(),
      a = await engine(db, drive),
      row = lesson();
    await db.lessons.put(row);
    await a.sync(true);
    const old = (await a.backups())[0];
    await db.lessons.update(row.id, { title: "新しいタイトル" });
    const extra = lesson();
    await db.lessons.put(extra);
    await a.restore(old);
    expect((await db.lessons.get(row.id))?.title).toBe("ルンバ");
    expect(await db.lessons.get(extra.id)).toBeDefined();
    expect(await db.syncSnapshots.count()).toBeGreaterThanOrEqual(2);
    expect(
      (await db.syncRevisions.get(recordKey("lessons", row.id)))?.heads,
    ).toHaveLength(1);
  });
  it("does not mark files received after an interrupted download", async () => {
    const a = database(),
      b = database(),
      drive = new MemoryDrive(),
      ea = await engine(a, drive),
      eb = await engine(b, drive);
    await a.lessons.put(lesson());
    await ea.sync(true);
    drive.failDownloads = true;
    await expect(eb.sync(true)).rejects.toThrow("offline");
    expect(await b.syncFiles.count()).toBe(0);
    expect(await b.lessons.count()).toBe(0);
    drive.failDownloads = false;
    await eb.sync(true);
    expect(await b.lessons.count()).toBe(1);
  });
  it("upgrades an existing v3 database without deleting any record", async () => {
    const name = `upgrade-${crypto.randomUUID()}`,
      old = new Dexie(name);
    old
      .version(3)
      .stores({ lessons: "id,date,originalDate,seriesId,*relatedGoalIds" });
    const row = lesson();
    await old.table("lessons").put(row);
    old.close();
    const upgraded = new DanceDatabase(name);
    databases.push(upgraded);
    await seedJournal(upgraded);
    expect(await upgraded.lessons.get(row.id)).toMatchObject(row);
    expect(await upgraded.syncEvents.count()).toBe(1);
  });
});
