import type { DanceDatabase } from "../data/db";
import { deviceState, silenceJournal } from "./journal";
import {
  canonical,
  cleanRow,
  content,
  InvalidSyncData,
  makeEvent,
  materialize,
  recordKey,
  validateEvent,
  validateRow,
  wireEvent,
  type ChangeEvent,
  type MediaRecord,
  type Row,
  type SyncConflict,
  type SyncTable,
} from "./model";

async function invalidAttachmentRelation(
  database: DanceDatabase,
  after: Row | null,
  before: Row | null,
) {
  const attachment = after ?? before;
  if (!attachment) return false;
  const owners = {
    lesson: "lessons",
    practice: "practiceLogs",
    event: "events",
    goal: "goals",
    learning: "learningNotes",
  };
  const owner = cleanRow(
    await database
      .table(owners[attachment.relatedType as keyof typeof owners])
      .get(String(attachment.relatedId)),
  );
  return after
    ? !owner ||
        (!!attachment.sectionId &&
          (!Array.isArray(owner.sections) ||
            !owner.sections.some(
              (section) => section.id === attachment.sectionId,
            )))
    : !!owner &&
        Array.isArray(owner.attachmentIds) &&
        owner.attachmentIds.includes(attachment.id);
}

export async function applyEvents(
  database: DanceDatabase,
  incoming: ChangeEvent[],
  media: MediaRecord[] = [],
) {
  incoming.forEach(validateEvent);
  await database.transaction("rw", database.tables, async () => {
    silenceJournal();
    const keys = new Set(
      (await database.syncConflicts.toArray()).map((conflict) => conflict.key),
    );
    for (const event of incoming) {
      const previous = await database.syncEvents.get(event.eventId);
      if (previous) {
        if (canonical(wireEvent(previous)) !== canonical(event))
          throw new InvalidSyncData(
            "同じイベントIDの内容が異なります。同期を停止しました。",
          );
        continue;
      }
      await database.syncEvents.add({
        ...event,
        status: "uploaded",
        applied: false,
      });
      keys.add(recordKey(event.recordType, event.recordId));
    }
    for (const file of media) {
      const old = await database.syncMedia.get(file.id);
      if (
        old &&
        (old.blob.size !== file.blob.size || old.blob.type !== file.blob.type)
      )
        throw new InvalidSyncData("添付資料のIDが重複しています。");
      await database.syncMedia.put(file);
    }
    // Validate the complete graph before applying any record. The transaction
    // rolls back every received event and record on malformed input.
    const results = [];
    for (const key of keys) {
      const [table, id] = JSON.parse(key) as [SyncTable, string];
      const events = await database.syncEvents
        .where("[recordType+recordId]")
        .equals([table, id])
        .toArray();
      const result = materialize(events);
      if (!result.fields.length && result.row) validateRow(table, result.row);
      results.push({ key, table, id, events, result });
    }
    results.sort(
      (a, b) =>
        Number(a.table === "attachments") - Number(b.table === "attachments"),
    );
    for (const { key, table, id, events, result } of results) {
      const current = cleanRow(await database.table(table).get(id));
      const priorRevision = await database.syncRevisions.get(key);
      let remoteVersion = priorRevision?.remoteVersion;
      let reason: SyncConflict["reason"] = "fields";
      let fields = result.fields;
      if (!fields.length && table === "attachments") {
        if (await invalidAttachmentRelation(database, result.row, current)) {
          reason = "relation";
          fields = ["$relation"];
        }
      }
      if (!fields.length) {
        try {
          if (result.row) {
            if (
              current &&
              "updatedAt" in current &&
              content(current) !== content(result.row)
            ) {
              // A device-local optimistic version protects an already-open form
              // from silently overwriting a change received in the background.
              remoteVersion = new Date(
                Math.max(
                  Date.now(),
                  Date.parse(String(current.updatedAt)) + 1,
                  Date.parse(String(result.row.updatedAt)),
                ),
              ).toISOString();
              result.row.updatedAt = remoteVersion;
            } else if (current && "updatedAt" in current)
              result.row.updatedAt = current.updatedAt;
            await database.table(table).put(result.row);
          } else {
            if (current && "updatedAt" in current)
              remoteVersion = new Date(
                Math.max(Date.now(), Date.parse(String(current.updatedAt)) + 1),
              ).toISOString();
            await database.table(table).delete(id);
          }
        } catch (error) {
          if (!(error instanceof Error) || error.name !== "ConstraintError")
            throw error;
          reason = "unique";
          fields = ["$unique"];
        }
      }
      await database.syncRevisions.put({
        key,
        ...result.revision,
        remoteVersion,
        conflicted: fields.length > 0,
      });
      if (fields.length) {
        await database.syncConflicts.put({
          key,
          recordType: table,
          recordId: id,
          fields,
          eventIds: result.revision.heads,
          current,
          merged: result.row,
          candidates: events
            .filter((event) => result.revision.heads.includes(event.eventId))
            .map((event) => ({
              eventId: event.eventId,
              deviceId: event.deviceId,
              deviceName: event.deviceName,
              createdAt: event.createdAt,
              row: event.after,
            })),
          reason,
        });
      } else {
        await database.syncConflicts.delete(key);
        await database.syncEvents
          .where("[recordType+recordId]")
          .equals([table, id])
          .modify({ applied: true });
      }
    }
    // Binary originals are retained in syncMedia even for conflicts/deletions.
    // Only attach files whose metadata is currently materialized.
    for (const file of await database.syncMedia.toArray())
      if (await database.attachments.get(file.id))
        await database.attachmentFiles.put(file);
  });
}

export async function resolveConflict(
  database: DanceDatabase,
  key: string,
  selected: Row | null,
  expectedHeads: string[],
) {
  await database.transaction("rw", database.tables, async () => {
    const conflict = await database.syncConflicts.get(key);
    const revision = await database.syncRevisions.get(key);
    if (
      !conflict ||
      !revision ||
      canonical(revision.heads) !== canonical([...expectedHeads].sort())
    )
      throw new Error("競合が更新されています。内容を再確認してください。");
    if (selected) {
      validateRow(conflict.recordType, selected);
      if (selected.id !== conflict.recordId)
        throw new Error("記録のIDは変更できません。");
    }
    const before = cleanRow(
      await database.table(conflict.recordType).get(conflict.recordId),
    );
    if (
      conflict.recordType === "attachments" &&
      (await invalidAttachmentRelation(database, selected, before))
    )
      throw new Error(
        "関連する記録や添付資料への参照を先に解決してください。原本は保持しています。",
      );
    const device = await deviceState(database);
    const after = selected
      ? cleanRow({
          ...selected,
          ...("updatedAt" in selected
            ? {
                updatedAt: new Date(
                  Math.max(
                    Date.now(),
                    Date.parse(
                      String(before?.updatedAt ?? selected.updatedAt),
                    ) + 1,
                  ),
                ).toISOString(),
              }
            : {}),
        })
      : null;
    const event = makeEvent(
      conflict.recordType,
      conflict.recordId,
      before,
      after,
      device.deviceId,
      revision.heads,
      "resolve",
      revision.fields,
      device.deviceName,
    );
    silenceJournal();
    if (after) await database.table(conflict.recordType).put(after);
    else await database.table(conflict.recordType).delete(conflict.recordId);
    await database.syncEvents.add({
      ...event,
      status: "pending",
      applied: true,
    });
    await database.syncEvents
      .where("[recordType+recordId]")
      .equals([conflict.recordType, conflict.recordId])
      .modify({ applied: true });
    await database.syncRevisions.put({
      key,
      heads: [event.eventId],
      fields: [...new Set([...revision.fields, ...Object.keys(event.changes)])],
      conflicted: false,
      remoteVersion: revision.remoteVersion,
    });
    await database.syncConflicts.delete(key);
    if (conflict.recordType === "attachments" && after) {
      const file = await database.syncMedia.get(after.id);
      if (file) await database.attachmentFiles.put(file);
    }
  });
}
