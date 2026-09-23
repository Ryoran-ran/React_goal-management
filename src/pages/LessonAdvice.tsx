import { DatePicker } from "../components/DatePicker";
import { LessonOutline } from "../components/LessonOutline";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { learningJournal } from "../data/learningJournal";
import { useQuery } from "../lib/hooks";
import { addDays } from "../lib/dates";
import {
  adviceRecords,
  groupAdviceRecords,
  selectedAdviceRecords,
  lessonAdvicePrompt,
} from "../lib/lessonAdvice";

export function LessonAdvice({
  today,
  onBack,
}: {
  today: string;
  onBack: () => void;
}) {
  const journal = useQuery(learningJournal);
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [question, setQuestion] = useState("");
  const [reflection, setReflection] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const records = adviceRecords(journal.data ?? [], start, end);
  const groups = groupAdviceRecords(records);
  const selected = selectedAdviceRecords(groups, excluded);
  const selectedCount = groups.filter(
    (group) => !excluded.has(group.id),
  ).length;
  const prompt = lessonAdvicePrompt(selected, start, end, question, reflection);
  const invalidRange = !start || !end || start > end;
  const copy = async () => {
    setNotice("");
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(
        "コピーしました。ChatGPTなどの入力欄に貼り付けて相談できます。",
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
        整理に戻る
      </button>
      <header className="learning-heading">
        <h1>レッスンをAIに相談</h1>
      </header>
      <section className="card">
        <p>
          期間と相談内容を指定すると、レッスン記録を含むプロンプトを作れます。コピーしてChatGPTなどに貼り付けてください。
        </p>
        <div className="form-grid">
          <label className="field">
            <span>開始日</span>
            <DatePicker
              type="date"
              value={start}
              onChange={(nextDateValue) => {
                setStart(nextDateValue);
                setExcluded(new Set());
                setNotice("");
              }}
            />
          </label>
          <label className="field">
            <span>終了日</span>
            <DatePicker
              type="date"
              value={end}
              onChange={(nextDateValue) => {
                setEnd(nextDateValue);
                setExcluded(new Set());
                setNotice("");
              }}
            />
          </label>
        </div>
        {invalidRange && (
          <p className="error" role="alert">
            開始日と終了日を、開始日が先になるように指定してください。
          </p>
        )}
        {journal.error ? (
          <p className="error" role="alert">
            記録を読み込めませんでした：{journal.error}
          </p>
        ) : !journal.data ? (
          <p role="status">記録を読み込み中…</p>
        ) : (
          !invalidRange && (
            <div className="subform">
              <p role="status">
                選択中：{selectedCount} / {groups.length}件のレッスン・メモ
              </p>
              <p className="muted">
                期間を変更するとすべて選択されます。不要なレッスンはチェックを外してください。カテゴリ別の記録はレッスン単位でまとめ、個別に残した学びのメモは別項目で表示します。
              </p>
              {records.length ? (
                <>
                  <div className="advice-selection-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={selectedCount === groups.length}
                      onClick={() => {
                        setExcluded(new Set());
                        setNotice("");
                      }}
                    >
                      全選択
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!selectedCount}
                      onClick={() => {
                        setExcluded(new Set(groups.map((group) => group.id)));
                        setNotice("");
                      }}
                    >
                      全解除
                    </button>
                  </div>
                  <ul
                    className="advice-lesson-list"
                    aria-label="相談に含めるレッスン・メモ"
                  >
                    {groups.map((group) => (
                      <li key={group.id} className="advice-lesson-item">
                        <label className="advice-lesson-choice">
                          <input
                            type="checkbox"
                            checked={!excluded.has(group.id)}
                            onChange={(e) => {
                              const include = e.target.checked;
                              setExcluded((old) => {
                                const next = new Set(old);
                                if (include) next.delete(group.id);
                                else next.add(group.id);
                                return next;
                              });
                              setNotice("");
                            }}
                          />
                          <span>
                            <strong>
                              {group.date} · {group.title}
                            </strong>
                            <span className="muted">
                              {group.categories.join("・")}
                            </span>
                          </span>
                        </label>
                        <details className="advice-lesson-content">
                          <summary>内容を確認</summary>
                          {group.records.map((record) => (
                            <section key={record.id}>
                              <h3>{record.category || "全体・未分類"}</h3>
                              {record.fields
                                .filter((field) => field.text.trim())
                                .map((field) => (
                                  <div key={field.label}>
                                    <strong>{field.label}</strong>
                                    <LessonOutline text={field.text} />
                                  </div>
                                ))}
                              {!!(
                                record.attachmentCount || record.youtubeCount
                              ) && (
                                <p className="muted">
                                  画像・動画：{record.attachmentCount}件 ／
                                  YouTube：{record.youtubeCount}件
                                </p>
                              )}
                            </section>
                          ))}
                        </details>
                      </li>
                    ))}
                  </ul>
                  {!selectedCount && (
                    <p role="status">
                      相談に含めるレッスン・メモを1件以上選んでください。
                    </p>
                  )}
                </>
              ) : (
                <p>
                  この期間にはレッスンの記録がありません。期間を変更するか、レッスン後の内容を記録してください。
                </p>
              )}
            </div>
          )
        )}
        <details className="advice-event-reflection">
          <summary>大会当日の振り返りを添える（任意）</summary>
          <label className="field">
            <span>大会名・日付、本番での気づき</span>
            <textarea
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setNotice("");
              }}
              placeholder={
                "大会名・日付：\n意識したテーマ：\nできたこと：\n難しかったこと：\n先生やパートナーからの指摘："
              }
            />
          </label>
          <p className="muted">
            覚えていることだけで大丈夫です。選んだレッスン記録と一緒にプロンプトに含めます。この入力は大会の記録には保存されません。
          </p>
        </details>
        <label className="field">
          <span>相談したいこと</span>
          <textarea
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setNotice("");
            }}
            placeholder="例：ルンバの体重移動について同じ指摘が続いています。記録から変化を整理して、次の練習で意識することを一つ提案してください。"
          />
        </label>
        <p className="muted">
          記録の文章とYouTubeリンクを含みます。画像・動画そのものは含みません。アプリからAIへの自動送信はありません。
        </p>
        <button
          type="button"
          className="primary"
          disabled={!prompt || !!journal.error}
          onClick={() => void copy()}
        >
          <Copy size={18} />
          プロンプトをコピー
        </button>
        {notice && <p role="status">{notice}</p>}
        {prompt && (
          <details
            className="advice-prompt-preview"
            open={expanded}
            onToggle={(e) => setExpanded(e.currentTarget.open)}
          >
            <summary>プロンプトを確認・手動でコピー</summary>
            <label className="field">
              <span>AIに貼り付けるプロンプト</span>
              <textarea
                readOnly
                value={prompt}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          </details>
        )}
      </section>
    </div>
  );
}
