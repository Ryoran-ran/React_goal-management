import { liveQuery } from "dexie";
import { db } from "../data/db";
import { AuthenticationRequired, GoogleDrive, type DriveFile } from "./drive";
import { SyncEngine } from "./engine";
import { authorizeGoogle, googleAccount, revokeGoogle } from "./google";
import { deviceState } from "./journal";
import { InvalidSyncData } from "./model";

interface SyncView {
  busy: boolean;
  authorized: boolean;
  phase: string;
  error: string;
  success: string;
  initial?: { local: boolean; cloud: boolean };
}
let view: SyncView = {
  busy: false,
  authorized: false,
  phase: "",
  error: "",
  success: "",
};
let credentials: { token: string; expiresAt: number } | undefined;
let lastAttempt = 0;
const listeners = new Set<() => void>();
function update(patch: Partial<SyncView>) {
  view = { ...view, ...patch };
  listeners.forEach((listener) => listener());
}
function token() {
  if (!credentials || credentials.expiresAt - 30_000 <= Date.now()) {
    credentials = undefined;
    update({ authorized: false });
    throw new AuthenticationRequired();
  }
  return credentials.token;
}
export const syncEngine = new SyncEngine(db, new GoogleDrive(token), (phase) =>
  update({ phase }),
);
export const subscribeSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const syncView = () => view;
async function perform(action: () => Promise<void>, syncing = false) {
  if (view.busy) return;
  update({ busy: true, error: "", success: "" });
  try {
    await action();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "同期できませんでした。ローカルの変更は保存されています。";
    update({ error: message });
    if (error instanceof AuthenticationRequired) {
      credentials = undefined;
      update({ authorized: false });
    }
    if (syncing) {
      const state = await deviceState(db);
      await db.syncMeta
        .put({
          ...state,
          error: message,
          blocked: !!state.blocked || error instanceof InvalidSyncData,
        })
        .catch(() => {});
    }
  } finally {
    update({ busy: false, phase: "" });
  }
}
export function connectGoogle() {
  if (view.busy) return Promise.resolve();
  // Start authorization before any await; popup opening requires user activation.
  const authorization = authorizeGoogle();
  return perform(async () => {
    const proposed = await authorization;
    const account = await googleAccount(proposed.token);
    await syncEngine.bindAccount(account);
    credentials = proposed;
    update({ authorized: true });
    const state = await deviceState(db);
    if (!state.initializedCloud)
      update({ initial: await syncEngine.inspect() });
    else {
      update({ success: "Googleアカウントを連携しました。" });
      if (state.autoSync && !state.blocked) await syncEngine.sync();
    }
  }, true);
}
export function syncNow(initial = false) {
  lastAttempt = Date.now();
  return perform(async () => {
    token();
    await syncEngine.sync(initial);
    update({ initial: undefined, success: "同期が完了しました。" });
  }, true);
}
export function disconnectGoogle() {
  return perform(async () => {
    const active =
      credentials && credentials.expiresAt > Date.now()
        ? credentials.token
        : undefined;
    credentials = undefined;
    update({ authorized: false, initial: undefined });
    await db.syncMeta.put({
      ...(await deviceState(db)),
      linked: false,
      error: undefined,
    });
    if (active) await revokeGoogle(active);
    update({
      success: active
        ? "Google連携を解除しました。ローカルのデータと未送信の変更は残っています。"
        : "この端末の連携を解除しました。Google側の権限も解除する場合は、Googleアカウントの接続設定から解除してください。",
    });
  });
}
export function createCloudBackup() {
  return perform(async () => {
    token();
    await syncEngine.snapshot();
    update({ success: "Google Driveにバックアップを保存しました。" });
  });
}
export function restoreCloudBackup(file: DriveFile) {
  return perform(async () => {
    token();
    await syncEngine.restore(file);
    update({
      success:
        "バックアップの内容を復元しました。復元前のデータも安全コピーに保存しています。「今すぐ同期」で他の端末にも反映できます。",
    });
  }, true);
}
export async function saveSyncSettings(input: {
  autoSync: boolean;
  idleSeconds: number;
  intervalMinutes: number;
  deviceName: string;
}) {
  if (
    !Number.isInteger(input.idleSeconds) ||
    input.idleSeconds < 5 ||
    input.idleSeconds > 3600 ||
    !Number.isInteger(input.intervalMinutes) ||
    input.intervalMinutes < 1 ||
    input.intervalMinutes > 1440 ||
    !input.deviceName.trim() ||
    input.deviceName.trim().length > 80
  )
    throw new Error("端末名と同期間隔を確認してください。");
  await db.syncMeta.put({
    ...(await deviceState(db)),
    ...input,
    deviceName: input.deviceName.trim(),
  });
}
export function startAutoSync() {
  let stopped = false,
    idle: ReturnType<typeof setTimeout> | undefined,
    pendingIds = "";
  let current: Awaited<ReturnType<typeof deviceState>> | undefined;
  const canSync = () =>
    !stopped &&
    !!current?.autoSync &&
    !!current.initializedCloud &&
    !current.blocked &&
    view.authorized &&
    !view.busy &&
    navigator.onLine &&
    document.visibilityState === "visible";
  const attempt = () => {
    if (credentials && credentials.expiresAt - 30_000 <= Date.now()) {
      credentials = undefined;
      update({ authorized: false });
    }
    if (canSync()) void syncNow();
  };
  const subscription = liveQuery(async () => ({
    state: await db.syncMeta.get("device"),
    ids: await db.syncEvents.where("status").equals("pending").primaryKeys(),
  })).subscribe({
    next({ state, ids }) {
      current = state;
      const next = ids.join("|");
      if (next !== pendingIds) {
        pendingIds = next;
        if (idle) clearTimeout(idle);
        if (ids.length)
          idle = setTimeout(attempt, (state?.idleSeconds ?? 30) * 1000);
      }
    },
    error() {
      /* Normal local editing does not depend on the scheduler. */
    },
  });
  const periodic = setInterval(() => {
    if (credentials && credentials.expiresAt - 30_000 <= Date.now()) {
      credentials = undefined;
      update({ authorized: false });
    }
    if (Date.now() - lastAttempt >= (current?.intervalMinutes ?? 5) * 60_000)
      attempt();
  }, 15_000);
  const visible = () => {
    if (document.visibilityState === "visible") attempt();
  };
  window.addEventListener("online", attempt);
  document.addEventListener("visibilitychange", visible);
  return () => {
    stopped = true;
    subscription.unsubscribe();
    clearInterval(periodic);
    if (idle) clearTimeout(idle);
    window.removeEventListener("online", attempt);
    document.removeEventListener("visibilitychange", visible);
  };
}
