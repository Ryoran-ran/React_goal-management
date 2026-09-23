import { useState } from "react";
import { ArrowLeft, Copy, Sparkles, Upload } from "lucide-react";
import type { DanceEvent } from "../types";
import { importAiEventSchedule } from "../data/aiScheduleImport";
import {
  aiEventSchedulePrompt,
  parseAiEventSchedule,
  previewScheduleImport,
  type AiEventScheduleDraft,
  type ScheduleImportPreview,
} from "../lib/aiEventSchedule";

const priorityLabels = { high: "高", medium: "中", low: "低" };

export function AiScheduleImport({
  event,
  onBack,
}: {
  event: DanceEvent;
  onBack: () => void;
}) {
  const [additionalRequest, setAdditionalRequest] = useState("");
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<AiEventScheduleDraft>();
  const [preview, setPreview] = useState<ScheduleImportPreview>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState(false);
  const [activeTab, setActiveTab] = useState<"request" | "import">("request");
  const prompt = aiEventSchedulePrompt(event, additionalRequest);

  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(
        "コピーしました。利用するAIへ貼り付け、返された回答を下の欄へ貼り付けてください。",
      );
      setActiveTab("import");
    } catch {
      setError(
        "コピーできませんでした。下のプロンプトを選択してコピーしてください。",
      );
    }
  };
  const inspect = () => {
    setError("");
    setNotice("");
    setImported(false);
    try {
      const parsed = parseAiEventSchedule(answer, event);
      setDraft(parsed);
      setPreview(previewScheduleImport(event, parsed));
    } catch (cause) {
      setDraft(undefined);
      setPreview(undefined);
      setError(
        cause instanceof Error ? cause.message : "内容を確認できませんでした。",
      );
    }
  };
  const runImport = async () => {
    if (!draft || !preview) return;
    setSaving(true);
    setError("");
    try {
      const result = await importAiEventSchedule(
        event.id,
        event.updatedAt,
        draft,
      );
      setImported(true);
      setPreview(result);
      setNotice(
        `マイルストーン${result.milestones.length}件、作業${result.workItems.length}件を追加しました。`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "取り込みに失敗しました。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="learning-page lesson-advice-page ai-schedule-import">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        準備スケジュールに戻る
      </button>
      <header className="learning-heading">
        <h1>AIで準備スケジュールを作成</h1>
        <p>
          {event.date} · {event.title}
        </p>
      </header>

      <div
        className="segmented ai-schedule-tabs"
        role="tablist"
        aria-label="AIスケジュール作成の操作"
      >
        <button
          type="button"
          id="ai-schedule-request-tab"
          role="tab"
          aria-selected={activeTab === "request"}
          aria-controls="ai-schedule-request-panel"
          className={activeTab === "request" ? "active" : ""}
          onClick={() => setActiveTab("request")}
        >
          作成を依頼
        </button>
        <button
          type="button"
          id="ai-schedule-import-tab"
          role="tab"
          aria-selected={activeTab === "import"}
          aria-controls="ai-schedule-import-panel"
          className={activeTab === "import" ? "active" : ""}
          onClick={() => setActiveTab("import")}
        >
          回答を取り込む
        </button>
      </div>

      {activeTab === "request" ? (
        <div
          id="ai-schedule-request-panel"
          role="tabpanel"
          aria-labelledby="ai-schedule-request-tab"
          className="ai-schedule-tab-panel"
        >
          <section className="card ai-schedule-step">
            <div className="ai-schedule-step-heading">
              <span>1</span>
              <div>
                <h2>AIに作成を依頼</h2>
                <p>イベント情報と既存予定を含むプロンプトをコピーします。</p>
              </div>
            </div>
            <label className="field">
              <span>追加の希望（任意）</span>
              <textarea
                value={additionalRequest}
                onChange={(changeEvent) => {
                  setAdditionalRequest(changeEvent.target.value);
                  setNotice("");
                }}
                placeholder="例：平日は短時間でできる作業にし、衣装準備は早めに始めてください。"
              />
            </label>
            <button
              type="button"
              className="primary"
              onClick={() => void copy()}
            >
              <Copy size={18} />
              作成依頼のプロンプトをコピー
            </button>
            <details className="advice-prompt-preview">
              <summary>プロンプトを確認・手動でコピー</summary>
              <label className="field">
                <span>AIに貼り付けるプロンプト</span>
                <textarea
                  readOnly
                  value={prompt}
                  onFocus={(focusEvent) => focusEvent.currentTarget.select()}
                />
              </label>
            </details>
          </section>
        </div>
      ) : (
        <div
          id="ai-schedule-import-panel"
          role="tabpanel"
          aria-labelledby="ai-schedule-import-tab"
          className="ai-schedule-tab-panel"
        >
          <section className="card ai-schedule-step">
            <div className="ai-schedule-step-heading">
              <span>2</span>
              <div>
                <h2>AIの回答を確認</h2>
                <p>AIから返された ```json ... ``` 形式の回答を貼り付けます。</p>
              </div>
            </div>
            <label className="field">
              <span>AIの回答</span>
              <textarea
                className="ai-schedule-answer"
                value={answer}
                onChange={(changeEvent) => {
                  setAnswer(changeEvent.target.value);
                  setDraft(undefined);
                  setPreview(undefined);
                  setImported(false);
                  setError("");
                  setNotice("");
                }}
                placeholder={
                  '```json\n{"eventTitle":"…","milestones":[],"workItems":[]}\n```'
                }
              />
            </label>
            <button type="button" className="secondary" onClick={inspect}>
              <Sparkles size={18} />
              内容を確認
            </button>
          </section>

          {preview && (
            <section className="card ai-schedule-step">
              <div className="ai-schedule-step-heading">
                <span>3</span>
                <div>
                  <h2>追加内容を確認</h2>
                  <p>
                    既存の予定は変更せず、下記の予定を追加します。すべて未着手で登録されます。
                  </p>
                </div>
              </div>
              <div className="ai-schedule-summary">
                <strong>マイルストーン {preview.milestones.length}件</strong>
                <strong>作業 {preview.workItems.length}件</strong>
              </div>
              {!!(preview.skippedMilestones || preview.skippedWorkItems) && (
                <p className="muted">
                  重複するマイルストーン {preview.skippedMilestones}件、作業{" "}
                  {preview.skippedWorkItems}
                  件は追加しません。
                </p>
              )}
              {!preview.milestones.length && !preview.workItems.length ? (
                <p>追加できる新しい予定はありません。</p>
              ) : (
                <ul className="calendar-prompt-items ai-schedule-preview">
                  {preview.milestones.map((item) => (
                    <li key={item.id}>
                      <span className="tag">到達点</span>
                      <span>
                        <strong>{item.title}</strong>
                        <span className="muted">期限 {item.dueDate}</span>
                      </span>
                    </li>
                  ))}
                  {preview.workItems.map((item) => (
                    <li key={item.id}>
                      <span className="tag">作業</span>
                      <span>
                        <strong>{item.title}</strong>
                        <span className="muted">
                          {item.startDate}〜{item.dueDate} · 優先度
                          {priorityLabels[item.priority]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!imported &&
                !!(preview.milestones.length || preview.workItems.length) && (
                  <button
                    type="button"
                    className="primary"
                    disabled={saving}
                    onClick={() => void runImport()}
                  >
                    <Upload size={18} />
                    {saving ? "追加中…" : "準備スケジュールに追加"}
                  </button>
                )}
            </section>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
