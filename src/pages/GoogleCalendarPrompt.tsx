import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import type { DanceEvent } from "../types";
import {
  googleCalendarItems,
  googleCalendarPrompt,
} from "../lib/googleCalendarPrompt";
import { readGoogleCalendarName } from "../lib/googleCalendarSettings";

const itemKindLabels = {
  event: "開催日",
  milestone: "期限",
  work: "準備作業",
};
export function GoogleCalendarPrompt({
  event,
  onBack,
}: {
  event: DanceEvent;
  onBack: () => void;
}) {
  const [includeFinished, setIncludeFinished] = useState(false);
  const [additionalRequest, setAdditionalRequest] = useState("");
  const [calendarName, setCalendarName] = useState(readGoogleCalendarName);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const schedule = googleCalendarItems(event, includeFinished);
  const itemCounts = {
    event: schedule.items.filter((item) => item.kind === "event").length,
    milestone: schedule.items.filter((item) => item.kind === "milestone")
      .length,
    work: schedule.items.filter((item) => item.kind === "work").length,
  };
  const prompt = googleCalendarPrompt(
    event,
    includeFinished,
    additionalRequest,
    calendarName,
  );
  const copy = async () => {
    setNotice("");
    if (!calendarName.trim()) {
      setNotice("登録先カレンダー名を入力してください。");
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(
        "コピーしました。Googleカレンダーを操作できるAIの入力欄へ貼り付けてください。",
      );
    } catch {
      setExpanded(true);
      setNotice(
        "コピーできませんでした。下のプロンプトを選択してコピーしてください。",
      );
    }
  };

  return (
    <div className="learning-page lesson-advice-page">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        準備スケジュールに戻る
      </button>
      <header className="learning-heading">
        <h1>Googleカレンダーへ登録</h1>
        <p>
          {event.date} · {event.title}
        </p>
      </header>
      <section className="card">
        <p>
          この大会・イベントの開催日と準備スケジュールを、Googleカレンダーへ登録するようAIに依頼するプロンプトを作れます。
        </p>
        <label className="field calendar-name-field">
          <span>登録先カレンダー名</span>
          <input
            required
            maxLength={200}
            value={calendarName}
            onChange={(changeEvent) => {
              setCalendarName(changeEvent.target.value);
              setNotice("");
            }}
            placeholder="例：Dance Note、ダンス予定"
          />
        </label>
        <p className="muted calendar-name-help">
          「整理」で設定した初期値です。この登録だけ別のカレンダーへ変更できます。見つからない場合は、AIが新しく作成する前に確認を求めます。
        </p>
        <label className="choice calendar-prompt-option">
          <input
            type="checkbox"
            checked={includeFinished}
            onChange={(changeEvent) => {
              setIncludeFinished(changeEvent.target.checked);
              setNotice("");
            }}
          />
          <span>達成・完了・見送り済みの項目も含める</span>
        </label>
        <details className="subform calendar-prompt-schedule">
          <summary>
            <span>
              <strong>登録予定：{schedule.items.length}件</strong>
              <small>
                開催日 {itemCounts.event}件・期限 {itemCounts.milestone}
                件・準備作業 {itemCounts.work}件
              </small>
            </span>
          </summary>
          <div className="calendar-prompt-schedule-body">
            <p className="muted">
              日時を登録していないため、すべて終日予定として依頼します。準備作業に開始日と終了日がある場合は、期間の予定になります。
            </p>
            <ul
              className="calendar-prompt-items"
              aria-label="Googleカレンダーへの登録予定"
            >
              {schedule.items.map((item) => (
                <li key={item.id}>
                  <span className="tag">{itemKindLabels[item.kind]}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <span className="muted">
                      {item.startDate === item.endDate
                        ? item.startDate
                        : `${item.startDate}〜${item.endDate}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {!!schedule.omittedUndatedCount && (
              <p className="muted">
                日付未設定の項目 {schedule.omittedUndatedCount}
                件は登録対象から除外します。
              </p>
            )}
          </div>
        </details>
        <label className="field">
          <span>追加の希望（任意）</span>
          <textarea
            value={additionalRequest}
            onChange={(changeEvent) => {
              setAdditionalRequest(changeEvent.target.value);
              setNotice("");
            }}
            placeholder="例：大会の予定には前日の通知を設定してください。準備作業は緑色にしてください。"
          />
        </label>
        <p className="muted">
          プロンプトは、登録前に予定一覧と重複候補を示して確認を求める内容です。このアプリからGoogleカレンダーやAIへ自動送信はしません。
        </p>
        <button type="button" className="primary" onClick={() => void copy()}>
          <Copy size={18} />
          プロンプトをコピー
        </button>
        {notice && <p role="status">{notice}</p>}
        <details
          className="advice-prompt-preview"
          open={expanded}
          onToggle={(toggleEvent) =>
            setExpanded(toggleEvent.currentTarget.open)
          }
        >
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
  );
}
