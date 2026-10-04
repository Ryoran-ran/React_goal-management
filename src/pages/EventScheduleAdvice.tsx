import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Compass,
  Copy,
  Flag,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { dateLabel } from "../lib/dates";
import { milestoneStatuses, sortedMilestones } from "../lib/milestones";
import { sortedEventWork, workStatuses } from "../lib/eventWork";
import { scrollPageToTop } from "../lib/pageScroll";
import {
  eventScheduleAdvicePrompt,
  eventScheduleRevisionJsonPrompt,
  type EventAdvicePurpose,
  type EventAdviceTarget,
} from "../lib/eventScheduleAdvice";
import {
  parseEventScheduleRevision,
  previewEventScheduleRevision,
  type EventScheduleRevisionDraft,
  type ScheduleRevisionPreview,
} from "../lib/eventScheduleRevision";
import { applyEventScheduleRevision } from "../data/eventScheduleRevision";
import { trainingChatAvailable } from "../lib/webmcp";

const purposes: {
  id: EventAdvicePurpose;
  title: string;
  description: string;
  icon: typeof RotateCcw;
}[] = [
  {
    id: "recovery",
    title: "予定を組み直す",
    description: "AIと変更案を相談し、決まった日付をまとめて反映します。",
    icon: CalendarClock,
  },
  {
    id: "direction",
    title: "方針を整理する",
    description: "優先すること・諦めることを相談し、方向を固めます。",
    icon: Compass,
  },
  {
    id: "completion",
    title: "完了としてよいか確認",
    description: "登録情報から、完了条件と不足点を確認します。",
    icon: CheckCircle2,
  },
  {
    id: "next",
    title: "次にやることを決める",
    description: "今もっとも重要な一歩を絞り込みます。",
    icon: ListTodo,
  },
  {
    id: "free",
    title: "自由に相談する",
    description: "決まった型を使わず、気になっていることを相談します。",
    icon: MessageCircle,
  },
];

export function EventScheduleAdvice({
  event,
  onBack,
}: {
  event: DanceEvent;
  onBack: () => void;
}) {
  const chatAvailable = trainingChatAvailable();
  const milestones = sortedMilestones(event.milestones ?? []);
  const workItems = sortedEventWork(event.workItems ?? []);
  const firstTarget =
    workItems.find((item) => item.status !== "completed") ??
    workItems[0] ??
    milestones.find((item) => !["achieved", "skipped"].includes(item.status)) ??
    milestones[0];
  const [purpose, setPurpose] = useState<EventAdvicePurpose>("recovery");
  const [targetKey, setTargetKey] = useState(
    firstTarget
      ? `${"priority" in firstTarget ? "work" : "milestone"}:${firstTarget.id}`
      : "",
  );
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [choosingTarget, setChoosingTarget] = useState(false);
  const [answer, setAnswer] = useState("");
  const [revision, setRevision] = useState<EventScheduleRevisionDraft>();
  const [revisionPreview, setRevisionPreview] =
    useState<ScheduleRevisionPreview>();
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);

  const [targetKind, targetId] = targetKey.split(":");
  const target: EventAdviceTarget | undefined =
    targetKind === "work"
      ? (() => {
          const item = workItems.find((candidate) => candidate.id === targetId);
          return item ? { kind: "work" as const, item } : undefined;
        })()
      : (() => {
          const item = milestones.find(
            (candidate) => candidate.id === targetId,
          );
          return item ? { kind: "milestone" as const, item } : undefined;
        })();
  const prompt = eventScheduleAdvicePrompt(
    event,
    purpose,
    purpose === "completion" ? target : undefined,
    note,
  );
  const revisionJsonPrompt = eventScheduleRevisionJsonPrompt(event);

  if (choosingTarget) {
    return (
      <EventAdviceTargetPicker
        event={event}
        milestones={milestones}
        workItems={workItems}
        selectedKey={targetKey}
        onBack={() => {
          setChoosingTarget(false);
          scrollPageToTop();
        }}
        onSelect={(key) => {
          setTargetKey(key);
          setNotice("");
          setChoosingTarget(false);
          scrollPageToTop();
        }}
      />
    );
  }

  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(
        purpose === "recovery"
          ? "コピーしました。AIの質問に答えて変更案を調整し、合意できたら下のJSON作成用プロンプトを同じChatへ送ってください。"
          : "コピーしました。ChatGPTなどの入力欄へ貼り付けて相談できます。",
      );
    } catch {
      setError(
        "コピーできませんでした。下のプロンプトを選択してコピーしてください。",
      );
    }
  };

  const copyRevisionJsonPrompt = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(revisionJsonPrompt);
      setNotice(
        "コピーしました。相談を続けていた同じChatへ貼り付け、返された確定JSONを下の欄へ貼り付けてください。",
      );
    } catch {
      setError(
        "コピーできませんでした。JSON作成用プロンプトを開いて手動でコピーしてください。",
      );
    }
  };

  const inspectRevision = () => {
    setError("");
    setNotice("");
    setApplied(false);
    try {
      const parsed = parseEventScheduleRevision(answer, event);
      setRevision(parsed);
      setRevisionPreview(previewEventScheduleRevision(event, parsed));
    } catch (cause) {
      setRevision(undefined);
      setRevisionPreview(undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "変更案を確認できませんでした。",
      );
    }
  };

  const applyRevision = async () => {
    if (!revision || !revisionPreview?.changes.length) return;
    setSaving(true);
    setError("");
    try {
      const result = await applyEventScheduleRevision(
        event.id,
        event.updatedAt,
        revision,
      );
      setApplied(true);
      setRevisionPreview(result);
      setNotice(`${result.changes.length}件の予定を変更しました。`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "予定を変更できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="learning-page lesson-advice-page event-schedule-advice">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        準備スケジュールに戻る
      </button>
      <header className="learning-heading">
        <h1>スケジュールを変更・相談</h1>
        <p>
          {dateLabel(event.date)} · {event.title}
        </p>
      </header>

      <section
        className={`card event-chat-guide ${chatAvailable ? "is-available" : ""}`}
      >
        <MessagesSquare size={24} aria-hidden="true" />
        <div>
          <h2>
            {chatAvailable
              ? "このままChatで相談できます"
              : "Chat連携対応の環境では、会話しながら変更できます"}
          </h2>
          <p>
            {`Chatに「${event.title}の予定を組み直したい」と話しかけてください。AIが最新の予定を読み、精度に影響する点を質問します。回答後に候補を比較し、合意するまでは変更せず、決まった項目だけを確認して反映します。`}
          </p>
          {!chatAvailable && (
            <p className="muted">
              現在の環境では直接連携を検出できないため、下のプロンプトをコピーして同じように相談できます。
            </p>
          )}
        </div>
      </section>

      <section className="card event-advice-form">
        <div>
          <h2>何を相談しますか？</h2>
          <p className="muted">
            予定の組み直しから方向性の整理、ちょっとした相談まで、目的に合うプロンプトを作ります。
          </p>
        </div>

        <div className="event-advice-purpose-list" role="radiogroup">
          {purposes.map((item) => {
            const Icon = item.icon;
            return (
              <label
                className={`event-advice-purpose ${
                  purpose === item.id ? "is-selected" : ""
                }`}
                key={item.id}
              >
                <input
                  type="radio"
                  name="event-advice-purpose"
                  value={item.id}
                  checked={purpose === item.id}
                  onChange={() => {
                    setPurpose(item.id);
                    setNotice("");
                    setError("");
                  }}
                />
                <Icon size={20} aria-hidden="true" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </label>
            );
          })}
        </div>

        {purpose === "completion" && (
          <section className="event-advice-target-field">
            <span>完了としてよいか相談する項目</span>
            {target ? (
              <div className="event-advice-selected-target">
                <span className="tag">
                  {target.kind === "work" ? "作業" : "マイルストーン"}
                </span>
                <strong>{target.item.title}</strong>
                <small>
                  {target.kind === "work"
                    ? workStatuses[target.item.status]
                    : milestoneStatuses[target.item.status]}
                </small>
              </div>
            ) : (
              <p className="muted">
                先に作業またはマイルストーンを登録すると、項目を指定して相談できます。
              </p>
            )}
            <button
              type="button"
              className="secondary event-advice-target-open"
              disabled={!workItems.length && !milestones.length}
              onClick={() => {
                setChoosingTarget(true);
                scrollPageToTop();
              }}
            >
              <Search size={18} />
              {target ? "対象を変更" : "対象を選ぶ"}
            </button>
          </section>
        )}

        <label className="field">
          <span>状況・気になっていること（任意）</span>
          <textarea
            value={note}
            maxLength={2000}
            onChange={(changeEvent) => {
              setNote(changeEvent.target.value);
              setNotice("");
            }}
            placeholder={
              purpose === "recovery"
                ? "例：衣装の到着が2週間遅れました。平日は30分、週末は2時間使えます。"
                : purpose === "completion"
                  ? "例：先生から内容に問題ないと言われ、必要な資料も受け取りました。"
                  : purpose === "direction"
                    ? "例：完成度を上げることと新しい振り付けを覚えることの、どちらを優先するか迷っています。"
                    : purpose === "free"
                      ? "例：準備への不安を整理したいです。何から考えるとよいですか？"
                      : "例：今週はレッスンが1回あり、それまでにできることを知りたいです。"
            }
          />
          <small>{note.length} / 2000文字</small>
        </label>

        <button type="button" className="primary" onClick={() => void copy()}>
          <Copy size={18} />
          {purpose === "recovery"
            ? "変更相談のプロンプトをコピー"
            : "相談用プロンプトをコピー"}
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

      {purpose === "recovery" && (
        <section className="card ai-schedule-step event-revision-import">
          <div className="ai-schedule-step-heading">
            <span>2</span>
            <div>
              <h2>決まった変更案を確認して反映</h2>
              <p>
                AIとの相談がまとまったら、JSON作成用プロンプトを同じChatへ送り、返された確定JSONを貼り付けます。確認するまでは予定は変わりません。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => void copyRevisionJsonPrompt()}
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
                value={revisionJsonPrompt}
                onFocus={(focusEvent) => focusEvent.currentTarget.select()}
              />
            </label>
          </details>
          <label className="field">
            <span>AIの最終回答</span>
            <textarea
              className="ai-schedule-answer"
              value={answer}
              onChange={(changeEvent) => {
                setAnswer(changeEvent.target.value);
                setRevision(undefined);
                setRevisionPreview(undefined);
                setApplied(false);
                setError("");
                setNotice("");
              }}
              placeholder={
                '相談後の説明と ```json\n{"eventTitle":"…","changes":[]}\n``` を含む最終回答'
              }
            />
          </label>
          <button type="button" className="secondary" onClick={inspectRevision}>
            <Sparkles size={18} />
            変更内容を確認
          </button>

          {revisionPreview && (
            <div className="event-revision-preview">
              <div className="ai-schedule-summary">
                <strong>変更 {revisionPreview.changes.length}件</strong>
              </div>
              {!!revisionPreview.skippedUnchanged && (
                <p className="muted">
                  日付が変わらない{revisionPreview.skippedUnchanged}
                  件は反映対象から外しました。
                </p>
              )}
              {!revisionPreview.changes.length ? (
                <p>変更が必要な予定はありません。</p>
              ) : (
                <ul className="calendar-prompt-items event-revision-items">
                  {revisionPreview.changes.map((change) => (
                    <li key={`${change.kind}:${change.id}`}>
                      <span className="tag">
                        {change.kind === "work" ? "作業" : "到達点"}
                      </span>
                      <span>
                        <strong>{change.title}</strong>
                        <span className="muted">
                          {scheduleLabel(change.from)} →{" "}
                          {scheduleLabel(change.to)}
                        </span>
                        <small>{change.reason}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!applied && !!revisionPreview.changes.length && (
                <button
                  type="button"
                  className="primary"
                  disabled={saving}
                  onClick={() => void applyRevision()}
                >
                  <Upload size={18} />
                  {saving
                    ? "変更中…"
                    : `${revisionPreview.changes.length}件の変更を反映`}
                </button>
              )}
            </div>
          )}
        </section>
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

function EventAdviceTargetPicker({
  event,
  milestones,
  workItems,
  selectedKey,
  onBack,
  onSelect,
}: {
  event: DanceEvent;
  milestones: EventMilestone[];
  workItems: EventWorkItem[];
  selectedKey: string;
  onBack: () => void;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  const matches = (...values: (string | undefined)[]) =>
    !normalizedQuery ||
    values.some((value) =>
      value?.toLocaleLowerCase("ja").includes(normalizedQuery),
    );
  const groups = milestones
    .map((milestone, index) => {
      const milestoneMatches = matches(
        milestone.title,
        milestone.successCriteria,
      );
      const children = workItems.filter(
        (item) =>
          item.milestoneId === milestone.id &&
          (milestoneMatches || matches(item.title, item.description)),
      );
      return {
        milestone,
        index,
        showMilestone: !normalizedQuery || milestoneMatches,
        children,
      };
    })
    .filter((group) => group.showMilestone || group.children.length);
  const unassigned = workItems.filter(
    (item) =>
      !item.milestoneId && matches(item.title, item.description, "未分類"),
  );
  const resultCount =
    groups.reduce(
      (count, group) =>
        count + group.children.length + (group.showMilestone ? 1 : 0),
      0,
    ) + unassigned.length;

  return (
    <div className="learning-page event-advice-target-picker">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        相談画面に戻る
      </button>
      <header className="learning-heading">
        <h1>相談する項目を選ぶ</h1>
        <p>{event.title}</p>
      </header>

      <label className="event-advice-target-search">
        <span>作業・マイルストーンを検索</span>
        <span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(changeEvent) => setQuery(changeEvent.target.value)}
            placeholder="名前・内容・達成条件で検索"
          />
        </span>
      </label>
      <p className="event-advice-target-help">
        マイルストーンの順に、その中の作業をまとめて表示しています。
      </p>
      <span className="muted event-advice-result-count">{resultCount}件</span>

      <div className="event-advice-target-groups">
        {groups.map((group) => (
          <section
            className="card event-advice-target-group"
            key={group.milestone.id}
          >
            <header>
              <span>マイルストーン {group.index + 1}</span>
              <h2>{group.milestone.title}</h2>
            </header>
            {group.showMilestone && (
              <TargetChoice
                selected={selectedKey === `milestone:${group.milestone.id}`}
                icon="milestone"
                title={group.milestone.title}
                meta={`マイルストーン · ${milestoneStatuses[group.milestone.status]}`}
                onClick={() => onSelect(`milestone:${group.milestone.id}`)}
              />
            )}
            {group.children.map((item) => (
              <TargetChoice
                key={item.id}
                selected={selectedKey === `work:${item.id}`}
                icon="work"
                title={item.title}
                meta={`作業 · ${workStatuses[item.status]}`}
                onClick={() => onSelect(`work:${item.id}`)}
              />
            ))}
          </section>
        ))}

        {!!unassigned.length && (
          <section className="card event-advice-target-group">
            <header>
              <span>マイルストーン未設定</span>
              <h2>未分類の作業</h2>
            </header>
            {unassigned.map((item) => (
              <TargetChoice
                key={item.id}
                selected={selectedKey === `work:${item.id}`}
                icon="work"
                title={item.title}
                meta={`作業 · ${workStatuses[item.status]}`}
                onClick={() => onSelect(`work:${item.id}`)}
              />
            ))}
          </section>
        )}

        {!resultCount && (
          <div className="card event-advice-target-empty">
            <Search size={24} aria-hidden="true" />
            <p>条件に合う項目がありません。</p>
            <button
              type="button"
              className="text-button"
              onClick={() => setQuery("")}
            >
              検索をクリア
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TargetChoice({
  selected,
  icon,
  title,
  meta,
  onClick,
}: {
  selected: boolean;
  icon: "milestone" | "work";
  title: string;
  meta: string;
  onClick: () => void;
}) {
  const Icon = icon === "milestone" ? Flag : ListTodo;
  return (
    <button
      type="button"
      className={`event-advice-target-choice ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <Icon size={18} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}
