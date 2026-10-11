import type { DanceDatabase } from "../data/db";
import {
  type DriveFile,
  type DriveTransport,
  maxDriveFileBytes,
  sha256,
} from "./drive";
import { deviceState, seedJournal } from "./journal";
import { applyEvents } from "./merge";
import {
  captureSnapshot,
  encodeSnapshot,
  hasSharedData,
  readSnapshot,
  restoreSnapshot,
} from "./snapshot";
import {
  canonical,
  InvalidSyncData,
  parseSyncJson,
  validateBatch,
  wireEvent,
  type EventBatch,
  type MediaPart,
  type MediaRecord,
  type MediaReference,
  type Outbox,
} from "./model";

export class SyncEngine {
  private running?: Promise<void>;
  constructor(
    readonly database: DanceDatabase,
    readonly drive: DriveTransport,
    readonly progress: (message: string) => void = () => {},
  ) {}
  async bindAccount(account: { id: string; email: string }) {
    await this.database.transaction("rw", this.database.syncMeta, async () => {
      const state = await deviceState(this.database);
      if (state.account && state.account.id !== account.id)
        throw new Error(
          `この端末のデータは ${state.account.email} に連携済みです。データ混在を防ぐため別アカウントには送信できません。元のアカウントで連携してください。`,
        );
      await this.database.syncMeta.put({
        ...state,
        account,
        linked: true,
        error: undefined,
      });
    });
  }
  async inspect() {
    const files = await this.drive.list();
    return {
      local: await hasSharedData(this.database),
      cloud: files.some(
        (file) =>
          file.name.startsWith("dance-note-events-") ||
          file.name.startsWith("dance-note-snapshot-"),
      ),
      files: files.length,
    };
  }
  sync(initialize = false): Promise<void> {
    if (this.running) return this.running;
    const run = async () => {
      const state = await deviceState(this.database);
      if (!state.account)
        throw new Error("Googleアカウントを連携してください。");
      if (!state.initializedCloud && !initialize)
        throw new Error("初回同期の内容を確認してください。");
      await seedJournal(this.database);
      this.progress("Google Driveを確認しています…");
      let files = await this.drive.list();
      if (!state.initializedCloud && (await hasSharedData(this.database))) {
        this.progress("初回統合前のバックアップを保存しています…");
        await this.snapshot(files);
        files = await this.drive.list();
      }
      // An empty device can bootstrap from one verified snapshot, then only
      // materialize newer/uncovered events. Historical files remain on Drive.
      if (!(await this.database.syncEvents.count())) {
        const snapshot = files
          .filter((file) => file.name.startsWith("dance-note-snapshot-"))
          .sort((a, b) => b.createdTime.localeCompare(a.createdTime))[0];
        if (snapshot) {
          this.progress("バックアップから履歴を読み込んでいます…");
          const prepared = await readSnapshot(
            await this.drive.download(snapshot),
            state.account.id,
          );
          const media = await this.receiveMedia(prepared.manifest.media, files);
          await this.database.transaction(
            "rw",
            this.database.tables,
            async () => {
              await applyEvents(this.database, prepared.manifest.events, [
                ...media,
                ...prepared.backup.files,
              ]);
              for (const receipt of prepared.manifest.verifiedFiles ?? [])
                await this.database.syncFiles.put(receipt);
            },
          );
        }
      }
      this.progress("変更履歴を受信しています…");
      const batches: { file: DriveFile; batch: EventBatch; hash: string }[] =
        [];
      for (const file of files.filter((file) =>
        file.name.startsWith("dance-note-events-"),
      )) {
        const receipt = await this.database.syncFiles.get(file.id);
        if (
          receipt &&
          file.modifiedTime &&
          receipt.modifiedTime === file.modifiedTime
        )
          continue;
        const blob = await this.drive.download(file, 32 * 1024 * 1024);
        const hash = await sha256(blob);
        if (receipt && receipt.sha256 !== hash)
          throw new InvalidSyncData(
            "取得済みの変更履歴が書き換えられています。同期を停止しました。",
          );
        const batch = parseSyncJson(await blob.text());
        validateBatch(batch);
        if (file.name !== `dance-note-events-${batch.batchId}`)
          throw new InvalidSyncData("同期履歴のファイル名とIDが一致しません。");
        batches.push({ file, batch, hash });
      }
      // Download/verify everything before the atomic application. No partial
      // receipt is marked complete if a later download or graph fails.
      const receivedMedia = await this.receiveMedia(
        batches.flatMap(({ batch }) => batch.media),
        files,
      );
      await this.database.transaction("rw", this.database.tables, async () => {
        await applyEvents(
          this.database,
          batches.flatMap(({ batch }) => batch.events),
          receivedMedia,
        );
        for (const { file, hash } of batches)
          await this.database.syncFiles.put({
            id: file.id,
            sha256: hash,
            modifiedTime: file.modifiedTime,
          });
      });
      this.progress("この端末の変更を送信しています…");
      await this.sendPending(files);
      const current = await deviceState(this.database);
      // Daily snapshots are supplemental. Every acknowledged event is already
      // durable in an immutable batch, so a failed snapshot does not lose edits.
      if (
        !current.lastSnapshot ||
        Date.now() - Date.parse(current.lastSnapshot) >= 24 * 60 * 60 * 1000
      )
        await this.snapshot(files);
      await this.database.syncMeta.put({
        ...(await deviceState(this.database)),
        initializedCloud: true,
        lastSync: new Date().toISOString(),
        error: undefined,
        blocked: false,
      });
      this.progress("同期が完了しました。");
    };
    this.running = this.withBrowserLock(run).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async withBrowserLock(run: () => Promise<void>) {
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(
        `dance-note-sync:${this.database.name}`,
        run,
      );
    return run();
  }
  private async immutable(name: string, blob: Blob, files: DriveFile[]) {
    if (blob.size > maxDriveFileBytes)
      throw new Error(
        "同期ファイルが大きすぎます（上限512 MiB）。ローカルのデータは保持されています。",
      );
    const expected = await sha256(blob);
    for (const file of files.filter((file) => file.name === name)) {
      const receipt = await this.database.syncFiles.get(file.id);
      if (
        receipt?.sha256 === expected &&
        file.modifiedTime &&
        receipt.modifiedTime === file.modifiedTime
      )
        return file;
      if (
        (await sha256(
          await this.drive.download(file, Math.max(blob.size, 1)),
        )) !== expected
      )
        throw new InvalidSyncData(
          "保存済み同期ファイルの内容が異なります。上書きせず同期を停止しました。",
        );
      if (!name.startsWith("dance-note-events-"))
        await this.database.syncFiles.put({
          id: file.id,
          sha256: expected,
          modifiedTime: file.modifiedTime,
        });
      return file;
    }
    const created = await this.drive.create(name, blob);
    files.push(created);
    if (!name.startsWith("dance-note-events-"))
      await this.database.syncFiles.put({
        id: created.id,
        sha256: expected,
        modifiedTime: created.modifiedTime,
      });
    // A successful create response and the original digest confirm the upload.
    // If the response is lost, retry discovers the same immutable name.
    return created;
  }
  private async sendMedia(
    records: MediaRecord[],
    files: DriveFile[],
  ): Promise<MediaReference[]> {
    const refs: MediaReference[] = [];
    const part = async (blob: Blob): Promise<MediaPart> => {
      const hash = await sha256(blob),
        name = `dance-note-media-${hash}`;
      await this.immutable(name, blob, files);
      return { name, sha256: hash, size: blob.size, type: blob.type };
    };
    for (const record of records)
      refs.push({
        id: record.id,
        blob: await part(record.blob),
        ...(record.thumbnailBlob
          ? { thumbnailBlob: await part(record.thumbnailBlob) }
          : {}),
      });
    return refs;
  }
  private async receiveMedia(
    refs: MediaReference[],
    files: DriveFile[],
  ): Promise<MediaRecord[]> {
    const unique = new Map<string, MediaReference>();
    for (const ref of refs) {
      if (
        unique.has(ref.id) &&
        canonical(unique.get(ref.id)) !== canonical(ref)
      )
        throw new InvalidSyncData("同じ添付資料IDの内容が異なります。");
      unique.set(ref.id, ref);
    }
    const records: MediaRecord[] = [];
    const part = async (ref: MediaPart): Promise<Blob> => {
      const file = files.find((file) => file.name === ref.name);
      if (!file)
        throw new Error(
          "同期に必要な添付資料が不足しています。再試行してください。",
        );
      const blob = await this.drive.download(file, Math.max(ref.size, 1));
      if (blob.size !== ref.size || (await sha256(blob)) !== ref.sha256)
        throw new InvalidSyncData(
          "添付資料が破損しています。自動適用を停止しました。",
        );
      return blob.slice(0, blob.size, ref.type);
    };
    for (const ref of unique.values()) {
      const stored = await this.database.syncMedia.get(ref.id);
      if (
        stored &&
        stored.blob.type === ref.blob.type &&
        stored.blob.size === ref.blob.size &&
        (await sha256(stored.blob)) === ref.blob.sha256 &&
        (!ref.thumbnailBlob ||
          (stored.thumbnailBlob &&
            (await sha256(stored.thumbnailBlob)) === ref.thumbnailBlob.sha256))
      ) {
        records.push(stored);
        continue;
      }
      if (stored)
        throw new InvalidSyncData(
          "添付資料のIDと原本が一致しません。同期を停止しました。",
        );
      records.push({
        id: ref.id,
        blob: await part(ref.blob),
        ...(ref.thumbnailBlob
          ? { thumbnailBlob: await part(ref.thumbnailBlob) }
          : {}),
      });
    }
    return records;
  }
  private async prepareOutbox(files: DriveFile[]): Promise<Outbox | undefined> {
    const existing = (await this.database.syncOutbox.toArray()).find(
      (item) => !item.uploaded,
    );
    if (existing) return existing;
    const all = await this.database.syncEvents
      .where("status")
      .equals("pending")
      .toArray();
    const idsInOutbox = new Set(all.map((event) => event.eventId));
    const remaining = new Map(
      all.map((event) => [
        event.eventId,
        event.baseRevision.filter((id) => idsInOutbox.has(id)).length,
      ]),
    );
    const children = new Map<string, typeof all>();
    for (const event of all)
      for (const parent of event.baseRevision.filter((id) =>
        idsInOutbox.has(id),
      )) {
        const list = children.get(parent) ?? [];
        list.push(event);
        children.set(parent, list);
      }
    const ordered = all.filter((event) => !remaining.get(event.eventId));
    for (let index = 0; index < ordered.length; index++)
      for (const child of children.get(ordered[index].eventId) ?? []) {
        const count = remaining.get(child.eventId)! - 1;
        remaining.set(child.eventId, count);
        if (!count) ordered.push(child);
      }
    if (ordered.length !== all.length)
      throw new InvalidSyncData("送信待ち履歴の参照が循環しています。");
    const pending = ordered.slice(0, 100);
    if (!pending.length) return;
    const ids = [
      ...new Set(
        pending
          .filter((event) => event.recordType === "attachments" && event.after)
          .map((event) => event.recordId),
      ),
    ];
    const media: MediaRecord[] = [];
    for (const id of ids) {
      const file = await this.database.syncMedia.get(id);
      if (!file)
        throw new Error(
          "送信する添付資料の原本が見つかりません。変更履歴は保持しています。",
        );
      media.push(file);
    }
    const refs = await this.sendMedia(media, files),
      id = crypto.randomUUID();
    const batch: EventBatch = {
      format: "dance-note-events",
      schemaVersion: 1,
      batchId: id,
      events: pending.map(wireEvent),
      media: refs,
    };
    validateBatch(batch);
    const item: Outbox = { id, batch, uploaded: false };
    await this.database.syncOutbox.add(item);
    return item;
  }
  private async sendPending(files: DriveFile[]) {
    // Bound one pass: edits made while uploading remain pending for the next pass.
    const count = await this.database.syncEvents
      .where("status")
      .equals("pending")
      .count();
    for (let sent = 0; sent < count;) {
      const item = await this.prepareOutbox(files);
      if (!item) break;
      const blob = new Blob([JSON.stringify(item.batch)], {
        type: "application/json",
      });
      if (blob.size > 32 * 1024 * 1024)
        throw new Error(
          "変更履歴が大きすぎるため送信できません。ローカルの変更は保存されています。",
        );
      const file = await this.immutable(
        `dance-note-events-${item.id}`,
        blob,
        files,
      );
      const digest = await sha256(blob);
      await this.database.transaction(
        "rw",
        this.database.syncEvents,
        this.database.syncOutbox,
        this.database.syncFiles,
        async () => {
          for (const event of item.batch.events)
            await this.database.syncEvents.update(event.eventId, {
              status: "uploaded",
            });
          await this.database.syncOutbox.update(item.id, { uploaded: true });
          await this.database.syncFiles.put({
            id: file.id,
            sha256: digest,
            modifiedTime: file.modifiedTime,
          });
        },
      );
      sent += item.batch.events.length;
    }
  }
  async snapshot(files?: DriveFile[]) {
    const capture = await captureSnapshot(this.database),
      list = files ?? (await this.drive.list());
    const refs = await this.sendMedia(capture.media, list);
    const blob = await encodeSnapshot(this.database, capture, refs),
      id = crypto.randomUUID();
    // The pre-operation safety copy also survives failed network uploads.
    await this.database.syncSnapshots.add({
      id,
      createdAt: capture.createdAt,
      blob,
    });
    await this.immutable(`dance-note-snapshot-${id}`, blob, list);
    await this.database.syncMeta.put({
      ...(await deviceState(this.database)),
      lastSnapshot: capture.createdAt,
    });
  }
  async backups() {
    return (await this.drive.list())
      .filter((file) => file.name.startsWith("dance-note-snapshot-"))
      .sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  }
  async previewBackup(file: DriveFile) {
    const state = await deviceState(this.database);
    if (!state.account) throw new Error("Googleアカウントを連携してください。");
    return readSnapshot(await this.drive.download(file), state.account.id);
  }
  async restore(file: DriveFile) {
    await this.withBrowserLock(async () => {
      const snapshot = await this.previewBackup(file);
      const files = await this.drive.list();
      await this.snapshot(files); // Preserve all current data before restoration.
      const media = await this.receiveMedia(snapshot.manifest.media, files);
      await applyEvents(this.database, [], media);
      await restoreSnapshot(this.database, snapshot);
    });
  }
}
