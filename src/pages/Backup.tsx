import { useRef, useState } from "react";
import { ArrowLeft, Download, Upload } from "lucide-react";
import {
  backupCounts,
  createBackup,
  currentBackupCounts,
  downloadBackup,
  readBackup,
  restoreBackup,
  type PreparedBackup,
} from "../data/backup";
import { errorText, useQuery } from "../lib/hooks";

export function Backup({ onBack }: { onBack: () => void }) {
  const current = useQuery(currentBackupCounts);
  const [preview, setPreview] = useState<{
    backup: PreparedBackup;
    name: string;
    size: number;
  }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const run = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress("");
    }
  };
  const exportFile = () =>
    run(async () => {
      downloadBackup(await createBackup(setProgress));
      setNotice("バックアップファイルのダウンロードを開始しました。");
    });
  return (
    <div className="learning-page backup-page">
      <button
        type="button"
        className="text-button"
        onClick={onBack}
        disabled={busy}
      >
        <ArrowLeft size={18} />
        整理に戻る
      </button>
      <header className="learning-heading">
        <h1>エクスポート・インポート</h1>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {current.error && (
        <p className="error" role="alert">
          {current.error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {busy && (
        <p role="status" aria-live="polite">
          {progress || "処理しています…"}
        </p>
      )}
      <section className="card">
        <h2>データをエクスポート</h2>
        <p>
          予定・記録・テーマ・目標・計画・設定を、画像・動画と一緒に1つのファイルに保存します。YouTubeのリンクも含まれます。
        </p>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void exportFile()}
        >
          <Download size={18} />
          すべてのデータをエクスポート
        </button>
      </section>
      <section className="card">
        <h2>バックアップをインポート</h2>
        <p>
          このアプリでエクスポートした .dancenote
          ファイルを選んでください。まず内容を確認し、その後に復元します。
        </p>
        <label className="field">
          <span>バックアップファイル</span>
          <input
            ref={input}
            type="file"
            accept=".dancenote"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(undefined);
              setConfirmed(false);
              setError("");
              setNotice("");
              if (file)
                void run(async () => {
                  const backup = await readBackup(file, setProgress);
                  setPreview({ backup, name: file.name, size: file.size });
                });
            }}
          />
        </label>
        {preview && (
          <div className="backup-preview">
            <h3>読み込む内容</h3>
            {preview.backup.tables.goals.length > 0 && (
              <p>
                このバックアップの廃止済み技術目標{" "}
                {preview.backup.tables.goals.length}
                件と、その目標専用の添付資料は復元されません。練習メモ・宿題・テーマとの記録の関連は引き継ぎます。
              </p>
            )}
            <p className="pre-wrap">
              {preview.name}
              <br />
              作成日時：
              {new Date(preview.backup.exportedAt).toLocaleString("ja-JP")}
              <br />
              ファイルサイズ：
              {(preview.size / 1024 / 1024).toLocaleString("ja-JP", {
                maximumFractionDigits: 2,
              })}{" "}
              MB
            </p>
            <table className="backup-counts">
              <caption>現在のデータとバックアップの件数</caption>
              <thead>
                <tr>
                  <th scope="col">種類</th>
                  <th scope="col">現在</th>
                  <th scope="col">読み込む件数</th>
                </tr>
              </thead>
              <tbody>
                {backupCounts(preview.backup.tables).map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {current.data?.find((item) => item.name === row.name)
                        ?.count ?? "…"}
                    </td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              インポートすると、現在のデータはすべてこのバックアップの内容に置き換わります。残しておきたい記録がある場合は、先に上のボタンからエクスポートしてください。
            </p>
            <label className="backup-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>現在のデータを、このバックアップの内容に置き換えます</span>
            </label>
            <div className="focus-create-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || !confirmed}
                onClick={() =>
                  void run(async () => {
                    if (!confirmed) return;
                    setProgress(
                      "データを復元しています。この画面を閉じずにお待ちください…",
                    );
                    try {
                      await restoreBackup(preview.backup);
                    } catch (cause) {
                      throw new Error(
                        `復元できませんでした。現在のデータは変更されていません。${errorText(cause)}`,
                      );
                    }
                    setPreview(undefined);
                    setConfirmed(false);
                    if (input.current) input.current.value = "";
                    setNotice(
                      "インポートが完了しました。予定や学びの記録から確認できます。",
                    );
                  })
                }
              >
                <Upload size={18} />
                この内容で復元する
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setPreview(undefined);
                  setConfirmed(false);
                  if (input.current) input.current.value = "";
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
