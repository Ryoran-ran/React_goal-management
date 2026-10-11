import Dexie, { type DBCore, type DBCoreTransaction } from "dexie";
import type { DanceDatabase } from "../data/db";
import {
  canonical,
  cleanRow,
  makeEvent,
  recordKey,
  sharedRow,
  syncTables,
  type DeviceState,
  type Revision,
  type StoredEvent,
  type SyncTable,
} from "./model";

const silentTransactions = new WeakSet<object>();
export function silenceJournal() {
  const transaction = Dexie.currentTransaction;
  if (!transaction)
    throw new Error("同期の書き込みにはトランザクションが必要です。");
  silentTransactions.add(transaction.idbtrans);
}
export const defaultDevice = (): DeviceState => ({
  key: "device",
  deviceId: crypto.randomUUID(),
  deviceName:
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad/i.test(navigator.userAgent)
      ? "スマートフォン"
      : "パソコン",
  autoSync: true,
  idleSeconds: 30,
  intervalMinutes: 5,
});
export async function deviceState(
  database: DanceDatabase,
): Promise<DeviceState> {
  return database.transaction("rw", database.syncMeta, async () => {
    let state = await database.syncMeta.get("device");
    if (!state) {
      state = defaultDevice();
      await database.syncMeta.put(state);
    }
    return state;
  });
}
export async function seedJournal(database: DanceDatabase) {
  await database.transaction("rw", database.tables, async () => {
    const device = await deviceState(database);
    for (const table of syncTables)
      for (const raw of await database.table(table).toArray()) {
        const row = cleanRow(raw)!;
        if (
          !sharedRow(table, row.id) ||
          (await database.syncRevisions.get(recordKey(table, row.id)))
        )
          continue;
        const event = makeEvent(
          table,
          row.id,
          null,
          row,
          device.deviceId,
          [],
          undefined,
          [],
          device.deviceName,
        );
        await database.syncEvents.add({
          ...event,
          status: "pending",
          applied: true,
        });
        await database.syncRevisions.put({
          key: recordKey(table, row.id),
          heads: [event.eventId],
          fields: Object.keys(event.changes),
          conflicted: false,
        });
      }
    for (const file of await database.attachmentFiles.toArray())
      if (!(await database.syncMedia.get(file.id)))
        await database.syncMedia.put(file);
  });
}
export function installJournal(database: DanceDatabase) {
  database.use({
    stack: "dbcore",
    name: "dance-note-journal",
    level: 10,
    create(down: DBCore) {
      const internal = ["syncEvents", "syncRevisions", "syncMeta", "syncMedia"];
      const queues = new WeakMap<DBCoreTransaction, Promise<unknown>>();
      if (!down.schema.tables.some((table) => table.name === "syncEvents"))
        return down;
      const put = async (
        name: string,
        values: unknown[],
        trans: DBCoreTransaction,
        add = false,
      ) => {
        const response = await down
          .table(name)
          .mutate({ type: add ? "add" : "put", values, trans });
        if (response.numFailures) throw Object.values(response.failures)[0];
      };
      return {
        ...down,
        transaction(stores, mode, options) {
          const journaled =
            mode === "readwrite" &&
            stores.some(
              (name) =>
                syncTables.includes(name as SyncTable) ||
                name === "attachmentFiles",
            );
          return down.transaction(
            journaled ? [...new Set([...stores, ...internal])] : stores,
            mode,
            options,
          );
        },
        table(name) {
          const table = down.table(name);
          const shared = syncTables.includes(name as SyncTable);
          if (!shared && name !== "attachmentFiles") return table;
          return {
            ...table,
            mutate(request) {
              if (silentTransactions.has(request.trans))
                return table.mutate(request);
              const task = (
                queues.get(request.trans) ?? Promise.resolve()
              ).then(async () => {
                try {
                  const old =
                    request.type === "deleteRange"
                      ? (
                          await table.query({
                            trans: request.trans,
                            values: true,
                            query: {
                              index: table.schema.primaryKey,
                              range: request.range,
                            },
                          })
                        ).result
                      : await table.getMany({
                          trans: request.trans,
                          keys:
                            request.type === "delete"
                              ? request.keys
                              : (request.keys ??
                                request.values.map((value) =>
                                  table.schema.primaryKey.extractKey!(value),
                                )),
                        });
                  const keys =
                    request.type === "deleteRange"
                      ? old.map((row) => row.id)
                      : request.type === "delete"
                        ? request.keys
                        : (request.keys ??
                          request.values.map((value) =>
                            table.schema.primaryKey.extractKey!(value),
                          ));
                  const relevant = keys
                    .map((id, index) => ({ id, index }))
                    .filter(
                      ({ id }) => !shared || sharedRow(name as SyncTable, id),
                    );
                  for (const { id } of relevant)
                    if (shared) {
                      const revision = (await down.table("syncRevisions").get({
                        trans: request.trans,
                        key: recordKey(name as SyncTable, id),
                      })) as Revision | undefined;
                      if (revision?.conflicted)
                        throw new Error(
                          "この記録には同期の競合があります。「Google Drive同期」で解決してから編集してください。",
                        );
                    }
                  const response = await table.mutate(request);
                  const next = await table.getMany({
                    trans: request.trans,
                    keys,
                  });
                  let device = (await down
                    .table("syncMeta")
                    .get({ trans: request.trans, key: "device" })) as
                    DeviceState | undefined;
                  if (!device) {
                    device = defaultDevice();
                    await put("syncMeta", [device], request.trans);
                  }
                  for (const { id, index } of relevant) {
                    if (response.failures[index]) continue;
                    if (!shared) {
                      if (next[index])
                        await put("syncMedia", [next[index]], request.trans);
                      continue;
                    }
                    const before = cleanRow(old[index]),
                      after = cleanRow(next[index]);
                    if (canonical(before) === canonical(after)) continue;
                    const key = recordKey(name as SyncTable, id);
                    let revision = (await down
                      .table("syncRevisions")
                      .get({ trans: request.trans, key })) as
                      Revision | undefined;
                    if (!revision && before) {
                      const seed = makeEvent(
                        name as SyncTable,
                        id,
                        null,
                        before,
                        device.deviceId,
                        [],
                        undefined,
                        [],
                        device.deviceName,
                      );
                      await put(
                        "syncEvents",
                        [
                          {
                            ...seed,
                            status: "pending",
                            applied: true,
                          } satisfies StoredEvent,
                        ],
                        request.trans,
                        true,
                      );
                      revision = {
                        key,
                        heads: [seed.eventId],
                        fields: Object.keys(seed.changes),
                        conflicted: false,
                      };
                    }
                    const event = makeEvent(
                      name as SyncTable,
                      id,
                      before,
                      after,
                      device.deviceId,
                      revision?.heads ?? [],
                      undefined,
                      revision?.fields,
                      device.deviceName,
                    );
                    if (
                      event.operation === "update" &&
                      !Object.keys(event.changes).length
                    )
                      continue;
                    await put(
                      "syncEvents",
                      [
                        {
                          ...event,
                          status: "pending",
                          applied: true,
                        } satisfies StoredEvent,
                      ],
                      request.trans,
                      true,
                    );
                    await put(
                      "syncRevisions",
                      [
                        {
                          ...revision,
                          key,
                          heads: [event.eventId],
                          fields: [
                            ...new Set([
                              ...(revision?.fields ?? []),
                              ...Object.keys(event.changes),
                            ]),
                          ],
                          conflicted: false,
                        },
                      ],
                      request.trans,
                    );
                  }
                  return response;
                } catch (error) {
                  request.trans.abort();
                  throw error;
                }
              });
              queues.set(request.trans, task);
              return task;
            },
          };
        },
      };
    },
  });
}
