import { useState } from "react";
import { ArrowLeft, Copy, Sparkles, Upload } from "lucide-react";
import type { DanceEvent } from "../types";
import { importAiEventSchedule } from "../data/aiScheduleImport";
import { learningJournal } from "../data/learningJournal";
import {
  aiEventScheduleConsultationPrompt,
  aiEventScheduleJsonPrompt,
  parseAiEventSchedule,
  previewScheduleImport,
  type AiEventScheduleDraft,
  type ScheduleImportPreview,
} from "../lib/aiEventSchedule";
import {
  previewEventScheduleRevision,
  type ScheduleRevisionPreview,
} from "../lib/eventScheduleRevision";
import { eventLessonPromptRecords } from "../lib/eventLessonPrompt";
import { useQuery } from "../lib/hooks";

const priorityLabels = { high: "高", medium: "中", low: "低" };
type AiSchedulePlanPreview = ScheduleImportPreview & ScheduleRevisionPreview;

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
  const [preview, setPreview] = useState<AiSchedulePlanPreview>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState(false);
  const [activeTab, setActiveTab] = useState<"request" | "import">("request");
  const journal = useQuery(learningJournal, [event.id]);
  const lessonRecords = eventLessonPromptRecords(journal.data ?? [], event.id);
  const consultationPrompt = aiEventScheduleConsultationPrompt(
    event,
    additionalRequest,
    undefined,
    lessonRecords,
  );
  const jsonPrompt = aiEventScheduleJsonPrompt(event);

  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(consultationPrompt);
      setNotice(
        "コピーしました。AIの質問にChatで答え、案を調整してください。案に合意すると最終JSONが返るので、この画面へ貼り付けてください。",
      );
      setActiveTab("import");
    } catch {
      setError(
        "コピーできませんでした。下のプロンプトを選択してコピーしてください。",
      );
    }
  };
  const copyJsonPrompt = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(jsonPrompt);
      setNotice(
        "コピーしました。相談を続けていた同じChatへ貼り付け、返された確定JSONを下の欄へ貼り付けてください。",
      );
    } catch {
      setError(
        "コピーできませんでした。下のJSON作成用プロンプトを選択してコピーしてください。",
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
      setPreview({
        ...previewScheduleImport(event, parsed),
        ...previewEventScheduleRevision(event, parsed),
      });
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
        `既存予定${result.changes.length}件を変更し、マイルストーン${result.milestones.length}件、作業${result.workItems.length}件を追加しました。`,
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
        <h1>AIで準備スケジュールを作成・見直す</h1>
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
          相談を始める
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
          確定案を取り込む
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
                <h2>AIと相談を始める</h2>
                <p>
                  イベント情報・既存予定・練習回数・関連レッスンの指摘や宿題を渡します。AIの質問に答えながら、無理のない予定へ調整します。
                </p>
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
            {journal.error && (
              <p className="error" role="alert">
                関連するレッスン記録を読み込めませんでした：{journal.error}
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={!journal.data || !!journal.error}
              onClick={() => void copy()}
            >
              <Copy size={18} />
              相談を始めるプロンプトをコピー
            </button>
            <details className="advice-prompt-preview">
              <summary>プロンプトを確認・手動でコピー</summary>
              <label className="field">
                <span>AIに貼り付けるプロンプト</span>
                <textarea
                  readOnly
                  value={consultationPrompt}
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
                <h2>合意した案をJSONに変換</h2>
                <p>
                  相談を続けていた同じChatに、JSON作成だけを依頼するプロンプトを送ります。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => void copyJsonPrompt()}
            >
              <Copy size={18} />
              JSON作成用プロンプトをコピー
            </button>
            <details className="advice-prompt-preview">
              <summary>JSON作成用プロンプトを確認・手動でコピー</summary>
              <label className="field">
                <span>合意後に同じChatへ貼り付けるプロンプト</span>
                <textarea
                  readOnly
                  value={jsonPrompt}
                  onFocus={(focusEvent) => focusEvent.currentTarget.select()}
                />
              </label>
            </details>
          </section>

          <section className="card ai-schedule-step">
            <div className="ai-schedule-step-heading">
              <span>3</span>
              <div>
                <h2>確定JSONを確認</h2>
                <p>
                  JSON作成用プロンプトへの回答として返された、```json ... ```
                  形式の確定版を貼り付けます。
                </p>
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
                  '```json\n{"eventTitle":"…","changes":[],"milestones":[],"workItems":[]}\n```'
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
                <span>4</span>
                <div>
                  <h2>変更・追加内容を確認</h2>
                  <p>
                    既存項目は同じ項目のまま日付を変更し、不足する予定だけを未着手で追加します。
                  </p>
                </div>
              </div>
              <div className="ai-schedule-summary">
                <strong>既存予定の変更 {preview.changes.length}件</strong>
                <strong>マイルストーン {preview.milestones.length}件</strong>
                <strong>作業 {preview.workItems.length}件</strong>
              </div>
              {!!(
                preview.skippedUnchanged ||
                preview.skippedMilestones ||
                preview.skippedWorkItems
              ) && (
                <p className="muted">
                  日付が変わらない既存予定 {preview.skippedUnchanged}件、
                  重複するマイルストーン {preview.skippedMilestones}件、作業{" "}
                  {preview.skippedWorkItems}
                  件は追加しません。
                </p>
              )}
              {!preview.changes.length &&
              !preview.milestones.length &&
              !preview.workItems.length ? (
                <p>変更・追加する予定はありません。</p>
              ) : (
                <ul className="calendar-prompt-items ai-schedule-preview">
                  {preview.changes.map((item) => (
                    <li key={`change:${item.kind}:${item.id}`}>
                      <span className="tag">変更</span>
                      <span>
                        <strong>{item.title}</strong>
                        <span className="muted">
                          {scheduleLabel(item.from)} → {scheduleLabel(item.to)}
                        </span>
                        <small>{item.reason}</small>
                      </span>
                    </li>
                  ))}
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
                !!(
                  preview.changes.length ||
                  preview.milestones.length ||
                  preview.workItems.length
                ) && (
                  <button
                    type="button"
                    className="primary"
                    disabled={saving}
                    onClick={() => void runImport()}
                  >
                    <Upload size={18} />
                    {saving ? "反映中…" : "変更・追加をスケジュールに反映"}
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

function scheduleLabel(plan: { startDate?: string; dueDate?: string }) {
  if (plan.startDate && plan.dueDate)
    return plan.startDate === plan.dueDate
      ? plan.startDate
      : `${plan.startDate}〜${plan.dueDate}`;
  return plan.startDate ?? plan.dueDate ?? "日付未設定";
}
