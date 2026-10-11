import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Cloud, RefreshCw } from "lucide-react";
import { db } from "../data/db";
import { backupCounts } from "../data/backup";
import { errorText, useQuery } from "../lib/hooks";
import {
  createSingleFileZip,
  isZipFile,
  readSingleFileZip,
} from "../lib/singleFileZip";
import { googleClientId, prepareGoogle } from "../sync/google";
import { deviceState } from "../sync/journal";
import { resolveConflict } from "../sync/merge";
import {
  canonical,
  conflictSelection,
  type Row,
  type SyncConflict,
} from "../sync/model";
import type { DriveFile } from "../sync/drive";
import {
  readSnapshot,
  restoreLocalSafetyCopy,
  type PreparedSnapshot,
} from "../sync/snapshot";
import { useUnsavedChanges } from "../lib/useUnsavedChanges";
import {
  connectGoogle,
  createCloudBackup,
  disconnectGoogle,
  restoreCloudBackup,
  saveSyncSettings,
  subscribeSync,
  syncEngine,
  syncNow,
  syncView,
} from "../sync/service";

const names: Record<string, string> = {
  events: "イベント",
  goals: "旧技術目標",
  monthlyPlans: "月の計画",
  weeklyPlans: "週の計画",
  practiceLogs: "自主練習",
  lessons: "レッスン",
  attachments: "添付資料",
  settings: "共有設定",
  themes: "テーマ",
  learningNotes: "学びの記録",
  title: "タイトル",
  memo: "メモ",
  homework: "宿題",
  teacherFeedback: "先生のアドバイス",
  sections: "カテゴリ別の内容",
  nextStep: "次に試すこと",
  date: "日付",
  completed: "実施済み",
  status: "状態",
  attachmentIds: "添付資料",
  workItems: "準備作業",
  milestones: "マイルストーン",
  practiceSessions: "練習予定",
  $record: "削除と編集",
  $unique: "同じ日付・期間の別記録",
  $relation: "関連する記録・添付資料",
};
const display = (value: unknown) =>
  value === undefined
    ? "（未設定）"
    : typeof value === "string"
      ? value || "（空欄）"
      : JSON.stringify(value, null, 2);
const time = (value?: string) =>
  value ? new Date(value).toLocaleString("ja-JP") : "まだ同期していません";
async function downloadSafetyCopy(blob: Blob, id: string) {
  const archive = await createSingleFileZip("dance-note-safety-copy.dat", blob),
    url = URL.createObjectURL(archive),
    link = document.createElement("a");
  link.href = url;
  link.download = `dance-note-safety-${id}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function safetyCopyData(blob: Blob) {
  return (await isZipFile(blob)) ? (await readSingleFileZip(blob)).file : blob;
}
function ConflictCard({
  conflict,
  busy,
}: {
  conflict: SyncConflict;
  busy: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [manual, setManual] = useState(
    JSON.stringify(
      conflictSelection(
        conflict,
        conflict.current ?? conflict.candidates[0]?.row,
      ),
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initialManual = JSON.stringify(
    conflictSelection(
      conflict,
      conflict.current ?? conflict.candidates[0]?.row,
    ),
    null,
    2,
  );
  useUnsavedChanges(
    selected === "manual" && manual !== initialManual && !saving,
  );
  const selectedPreview =
    selected === "manual"
      ? manual
      : selected === "current"
        ? JSON.stringify(conflictSelection(conflict, conflict.current), null, 2)
        : selected
          ? JSON.stringify(
              conflictSelection(
                conflict,
                conflict.candidates.find(
                  (candidate) => candidate.eventId === selected,
                )!.row,
              ),
              null,
              2,
            )
          : manual;
  const choose = async () => {
    setSaving(true);
    setError("");
    try {
      const row =
        selected === "manual"
          ? (JSON.parse(manual) as Row | null)
          : conflictSelection(
              conflict,
              selected === "current"
                ? conflict.current
                : conflict.candidates.find(
                    (candidate) => candidate.eventId === selected,
                  )!.row,
            );
      await resolveConflict(db, conflict.key, row, conflict.eventIds);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="card sync-conflict">
      <h3>
        {names[conflict.recordType]}：
        {String(
          conflict.current?.title ??
            conflict.candidates.find((candidate) => candidate.row)?.row
              ?.title ??
            conflict.recordId,
        )}
      </h3>
      <p>
        両方の変更を保持しています。競合していない項目は、選択した内容と一緒に統合します。
      </p>
      {conflict.reason === "unique" && (
        <p className="error">
          この日付・期間には別のIDの記録があります。通常の画面で既存記録の日付を変更するか、手動調整で取り込む記録の日付を変更してください。
        </p>
      )}
      {conflict.reason === "relation" && (
        <p>
          関連する記録を先に解決してください。元の添付資料は保持されています。
        </p>
      )}
      <div
        className="sync-compare"
        role="region"
        aria-label="競合内容の比較"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>項目</th>
              <th>この端末の現在の状態</th>
              {conflict.candidates.map((candidate) => (
                <th key={candidate.eventId}>
                  {candidate.deviceName}
                  <small>{time(candidate.createdAt)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conflict.fields.map((field) => (
              <tr key={field}>
                <th>{names[field] ?? field}</th>
                <td>
                  <pre>
                    {field.startsWith("$")
                      ? conflict.current
                        ? "記録あり"
                        : "記録なし・削除済み"
                      : display(conflict.current?.[field])}
                  </pre>
                </td>
                {conflict.candidates.map((candidate) => (
                  <td key={candidate.eventId}>
                    <pre>
                      {field.startsWith("$")
                        ? candidate.row
                          ? "記録あり"
                          : "削除"
                        : display(candidate.row?.[field])}
                    </pre>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset disabled={busy || saving}>
        <legend>採用する内容</legend>
        <label className="sync-check">
          <input
            type="radio"
            name={conflict.key}
            checked={selected === "current"}
            onChange={() => setSelected("current")}
          />
          この端末の現在の状態
        </label>
        {conflict.candidates.map((candidate) => (
          <label className="sync-check" key={candidate.eventId}>
            <input
              type="radio"
              name={conflict.key}
              checked={selected === candidate.eventId}
              onChange={() => setSelected(candidate.eventId)}
            />
            {candidate.deviceName} の変更{candidate.row ? "" : "（削除）"}
          </label>
        ))}
        <label className="sync-check">
          <input
            type="radio"
            name={conflict.key}
            checked={selected === "manual"}
            onChange={() => setSelected("manual")}
          />
          両方を確認して手動で調整
        </label>
        {selected === "manual" && (
          <label className="field">
            <span>統合する記録（JSON形式・IDは変更できません）</span>
            <textarea
              className="sync-json"
              rows={12}
              value={manual}
              onChange={(event) => setManual(event.target.value)}
            />
            <small>
              文字列の内容を調整してください。削除を選ぶ場合は null
              と入力します。
            </small>
          </label>
        )}
        <details>
          <summary>採用する記録全体を確認</summary>
          <pre className="sync-json-preview">{selectedPreview}</pre>
        </details>
        <button
          type="button"
          className="primary"
          disabled={!selected}
          onClick={() => void choose()}
        >
          {saving ? "保存しています…" : "選んだ内容で競合を解決"}
        </button>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export function Sync({ onBack }: { onBack: () => void }) {
  const status = useSyncExternalStore(subscribeSync, syncView);
  const query = useQuery(
    async () => ({
      state: await db.syncMeta.get("device"),
      pending: await db.syncEvents.where("status").equals("pending").count(),
      conflicts: await db.syncConflicts.toArray(),
      localBackups: await db.syncSnapshots
        .orderBy("createdAt")
        .reverse()
        .toArray(),
    }),
    [],
    () => deviceState(db),
  );
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [localError, setLocalError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [settings, setSettings] = useState<{
    autoSync: boolean;
    idleSeconds: number;
    intervalMinutes: number;
    deviceName: string;
  }>();
  const [backups, setBackups] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    file?: DriveFile;
    localBlob?: Blob;
    snapshot: PreparedSnapshot;
  }>();
  const [confirmed, setConfirmed] = useState(false);
  const [initialConfirmed, setInitialConfirmed] = useState(false);
  useEffect(() => {
    let stopped = false;
    if (googleClientId)
      prepareGoogle()
        .then(() => {
          if (!stopped) setGoogleReady(true);
        })
        .catch((error) => {
          if (!stopped) setGoogleError(errorText(error));
        });
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    if (!settings && query.data?.state) setSettings(query.data.state);
  }, [query.data?.state, settings]);
  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setLocalError("");
    setLocalNotice("");
    try {
      await action();
    } catch (cause) {
      setLocalError(errorText(cause));
    } finally {
      setLoading(false);
    }
  };
  const busy = status.busy || loading,
    state = query.data?.state;
  return (
    <div className="learning-page sync-page">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        整理に戻る
      </button>
      <header className="learning-heading">
        <h1>Google Drive同期</h1>
        <p>スマートフォンとパソコンで、同じ練習ノートを使えます。</p>
      </header>
      {(status.error || localError || query.error) && (
        <p className="error" role="alert">
          {status.error || localError || query.error}
        </p>
      )}
      {(status.success || localNotice) && (
        <p className="success" role="status">
          {localNotice || status.success}
        </p>
      )}
      {status.busy && (
        <p role="status" aria-live="polite">
          {status.phase || "処理しています…"}
        </p>
      )}
      <section className="card">
        <div className="section-heading">
          <h2>
            <Cloud size={24} />
            Googleアカウント
          </h2>
        </div>
        <p>
          {state?.account
            ? `${state.account.email}：${status.authorized ? "連携中" : state.linked ? "再連携が必要です" : "連携解除済み"}`
            : "Googleアカウントは未連携です。"}
        </p>
        <p className="muted">
          いつでもこの端末だけで利用できます。連携を解除しても記録と未送信の変更は残ります。
        </p>
        {!googleClientId ? (
          <p>
            Google連携はまだ設定されていません。管理者がREADMEの設定手順に沿って公開すると利用できます。
          </p>
        ) : (
          <>
            {googleError && (
              <p className="error" role="alert">
                {googleError}
              </p>
            )}
            <div className="sync-actions">
              <button
                className="primary"
                type="button"
                disabled={busy || !googleReady}
                onClick={() => void connectGoogle()}
              >
                {!googleReady
                  ? "Google連携を準備しています…"
                  : state?.account
                    ? "Googleアカウントを再連携"
                    : "Googleアカウントを連携"}
              </button>
              {state?.account && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void disconnectGoogle()}
                >
                  連携解除
                </button>
              )}
            </div>
          </>
        )}
        {state?.account && (
          <p className="muted">
            この端末の記録は上記アカウントに紐付いています。別アカウントへの送信は停止して、データの混在を防ぎます。
          </p>
        )}
      </section>
      <section className="card">
        <h2>同期状況</h2>
        <dl className="sync-summary">
          <div>
            <dt>最終同期</dt>
            <dd>{time(state?.lastSync)}</dd>
          </div>
          <div>
            <dt>未送信の変更</dt>
            <dd>{query.data?.pending ?? "…"} 件</dd>
          </div>
          <div>
            <dt>競合</dt>
            <dd>{query.data?.conflicts.length ?? "…"} 件</dd>
          </div>
          <div>
            <dt>状態</dt>
            <dd>
              {status.busy
                ? "同期中"
                : state?.blocked
                  ? "自動適用を停止中"
                  : status.error || state?.error
                    ? "同期失敗（ローカル保存は継続）"
                    : state?.lastSync
                      ? "同期成功"
                      : "ローカル保存"}
            </dd>
          </div>
        </dl>
        {state?.blocked && (
          <p className="error">
            データの不整合を検出したため、自動同期を停止しています。内容を確認してから手動で再試行してください。
          </p>
        )}
        {state?.error && !status.error && (
          <p className="error">{state.error}</p>
        )}
        {status.initial && (
          <div className="sync-initial">
            <h3>初回同期</h3>
            <p>
              {status.initial.local && status.initial.cloud
                ? "この端末とDriveの両方にデータがあります。現在のデータをバックアップしてから統合します。同じ項目の異なる変更は競合として確認できます。"
                : status.initial.cloud
                  ? "Driveのデータをこの端末に取り込みます。"
                  : "この端末の記録を保持したまま、Driveに初期バックアップと変更履歴を保存します。"}
            </p>
            {status.initial.local && status.initial.cloud && (
              <label className="sync-check">
                <input
                  type="checkbox"
                  checked={initialConfirmed}
                  onChange={(event) =>
                    setInitialConfirmed(event.target.checked)
                  }
                />
                この端末とDriveのデータを統合することを確認しました
              </label>
            )}
            <button
              type="button"
              className="primary"
              disabled={
                busy ||
                (status.initial.local &&
                  status.initial.cloud &&
                  !initialConfirmed)
              }
              onClick={() => void syncNow(true)}
            >
              初回同期を開始
            </button>
          </div>
        )}
        <button
          type="button"
          className="primary"
          disabled={busy || !status.authorized || !state?.initializedCloud}
          onClick={() => void syncNow()}
        >
          <RefreshCw size={18} />
          今すぐ同期
        </button>
        {!status.authorized && state?.account && (
          <p className="muted">
            アプリを開き直したときや認証期限が切れたときは、上の再連携ボタンからGoogleに接続してください。
          </p>
        )}
      </section>
      {settings && (
        <section className="card">
          <h2>自動同期</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveSyncSettings(settings);
                setLocalNotice("同期設定を保存しました。");
              });
            }}
          >
            <label className="sync-check">
              <input
                type="checkbox"
                checked={settings.autoSync}
                onChange={(event) =>
                  setSettings({ ...settings, autoSync: event.target.checked })
                }
              />
              自動同期を使う
            </label>
            <div className="sync-settings-grid">
              <label className="field">
                <span>この端末の名前</span>
                <input
                  required
                  maxLength={80}
                  value={settings.deviceName}
                  onChange={(event) =>
                    setSettings({ ...settings, deviceName: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>変更後の待ち時間（秒）</span>
                <input
                  type="number"
                  min={5}
                  max={3600}
                  required
                  value={settings.idleSeconds}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      idleSeconds: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>定期同期の間隔（分）</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  required
                  value={settings.intervalMinutes}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      intervalMinutes: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className="muted">
              アプリを開いていて、Googleの認証が有効な間に同期します。ネット接続の復帰時にも再試行します。
            </p>
            <button type="submit" className="secondary" disabled={busy}>
              同期設定を保存
            </button>
          </form>
        </section>
      )}
      <section aria-labelledby="sync-conflicts-title">
        <h2 id="sync-conflicts-title">競合の確認・解決</h2>
        {query.data?.conflicts.length ? (
          query.data.conflicts.map((conflict) => (
            <ConflictCard
              key={`${conflict.key}:${canonical(conflict.eventIds)}`}
              conflict={conflict}
              busy={busy}
            />
          ))
        ) : (
          <p>未解決の競合はありません。</p>
        )}
      </section>
      <section className="card">
        <h2>バックアップ・復元</h2>
        <p>
          初回連携時と約24時間ごとにバックアップします。過去の世代も保持します。
        </p>
        <div className="sync-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || !status.authorized}
            onClick={() => void createCloudBackup()}
          >
            今の状態をバックアップ
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !status.authorized}
            onClick={() =>
              void run(async () => {
                setBackups(await syncEngine.backups());
              })
            }
          >
            Driveのバックアップ一覧を取得
          </button>
        </div>
        {backups.length > 0 && (
          <ul className="sync-backups">
            {backups.map((file) => (
              <li key={file.id}>
                <span>{time(file.createdTime)}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setPreview({
                        file,
                        snapshot: await syncEngine.previewBackup(file),
                      });
                      setConfirmed(false);
                    })
                  }
                >
                  内容を確認
                </button>
              </li>
            ))}
          </ul>
        )}
        {preview && (
          <div className="sync-initial">
            <h3>復元するバックアップ</h3>
            <p>{time(preview.snapshot.manifest.createdAt)}</p>
            <ul>
              {backupCounts(preview.snapshot.backup.tables)
                .filter((row) => row.count > 0)
                .map((row) => (
                  <li key={row.name}>
                    {row.label}：{row.count} 件
                  </li>
                ))}
            </ul>
            <p>
              バックアップにある記録を当時の内容へ戻します。バックアップにない現在の記録は残します。復元前の状態を安全コピーとして保存し、復元操作も変更履歴に記録します。
            </p>
            <label className="sync-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              この内容で復元することを確認しました
            </label>
            <div className="sync-actions">
              <button
                type="button"
                className="primary"
                disabled={
                  busy || !confirmed || (!!preview.file && !status.authorized)
                }
                onClick={() => {
                  if (preview.file) void restoreCloudBackup(preview.file);
                  else if (preview.localBlob)
                    void run(async () => {
                      await restoreLocalSafetyCopy(db, preview.localBlob!);
                      setLocalNotice(
                        "安全コピーを復元しました。復元前の状態も保存しています。",
                      );
                    });
                  setPreview(undefined);
                  setConfirmed(false);
                }}
              >
                このバックアップから復元
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setPreview(undefined)}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
        <label className="field">
          <span>保存した安全コピーを確認（ZIP）</span>
          <input
            type="file"
            accept=".zip,.dancenote-sync,application/zip"
            disabled={busy}
            onChange={(event) => {
              const blob = event.target.files?.[0];
              if (blob)
                void run(async () => {
                  const snapshotBlob = await safetyCopyData(blob);
                  setPreview({
                    localBlob: snapshotBlob,
                    snapshot: await readSnapshot(
                      snapshotBlob,
                      state?.account?.id ?? "",
                    ),
                  });
                  setConfirmed(false);
                });
            }}
          />
          <small>
            通常のバックアップZIPは「エクスポート・インポート」から読み込めます。旧
            .dancenote-syncも選択できます。
          </small>
        </label>
        {(query.data?.localBackups.length ?? 0) > 0 && (
          <details>
            <summary>
              この端末の安全コピー（{query.data?.localBackups.length} 件）
            </summary>
            <p>
              復元前などの状態を端末内にも保管しています。Google連携なしで復元・ダウンロードできます。
            </p>
            <ul className="sync-backups">
              {query.data?.localBackups.map((backup) => (
                <li key={backup.id}>
                  <span>{time(backup.createdAt)}</span>
                  <div className="sync-actions">
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setPreview({
                            localBlob: backup.blob,
                            snapshot: await readSnapshot(
                              backup.blob,
                              state?.account?.id ?? "",
                            ),
                          });
                          setConfirmed(false);
                        })
                      }
                    >
                      復元内容を確認
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await downloadSafetyCopy(backup.blob, backup.id);
                        })
                      }
                    >
                      ダウンロード
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
