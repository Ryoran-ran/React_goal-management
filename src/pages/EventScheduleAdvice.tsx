import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  Flag,
  ListTodo,
  RotateCcw,
  Search,
} from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { dateLabel } from "../lib/dates";
import { milestoneStatuses, sortedMilestones } from "../lib/milestones";
import { sortedEventWork, workStatuses } from "../lib/eventWork";
import { scrollPageToTop } from "../lib/pageScroll";
import {
  eventScheduleAdvicePrompt,
  type EventAdvicePurpose,
  type EventAdviceTarget,
} from "../lib/eventScheduleAdvice";

const purposes: {
  id: EventAdvicePurpose;
  title: string;
  description: string;
  icon: typeof RotateCcw;
}[] = [
  {
    id: "recovery",
    title: "遅れを立て直す",
    description: "延期・縮小も含め、現実的な順番を相談します。",
    icon: RotateCcw,
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
];

export function EventScheduleAdvice({
  event,
  onBack,
}: {
  event: DanceEvent;
  onBack: () => void;
}) {
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
        "コピーしました。ChatGPTなどの入力欄へ貼り付けて相談できます。",
      );
    } catch {
      setError(
        "コピーできませんでした。下のプロンプトを選択してコピーしてください。",
      );
    }
  };

  return (
    <div className="learning-page lesson-advice-page event-schedule-advice">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        準備スケジュールに戻る
      </button>
      <header className="learning-heading">
        <h1>準備スケジュールをAIに相談</h1>
        <p>
          {dateLabel(event.date)} · {event.title}
        </p>
      </header>

      <section className="card event-advice-form">
        <div>
          <h2>何を相談しますか？</h2>
          <p className="muted">
            現在のイベント情報、到達点、作業と進捗を含むプロンプトを作ります。
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
                ? "例：平日は30分、週末は2時間使えます。衣装準備が予定より遅れています。"
                : purpose === "completion"
                  ? "例：先生から内容に問題ないと言われ、必要な資料も受け取りました。"
                  : "例：今週はレッスンが1回あり、それまでにできることを知りたいです。"
            }
          />
          <small>{note.length} / 2000文字</small>
        </label>

        <button type="button" className="primary" onClick={() => void copy()}>
          <Copy size={18} />
          相談用プロンプトをコピー
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

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
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
