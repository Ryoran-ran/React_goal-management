import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { learningJournal, filterJournal } from "../data/learningJournal";
import type { AgendaItem } from "../data/practiceAgenda";
import type { LearningNote, LearningTheme } from "../types";
import { useQuery } from "../lib/hooks";
import { dateLabel } from "../lib/dates";
import { categoryNameKey } from "../lib/lessonCategories";
import { noteKinds } from "./LearningNoteEditor";

export function LearningJournal({
  themes,
  onNote,
  onScheduleRecord,
  onCreate,
}: {
  themes: LearningTheme[];
  onNote: (note: LearningNote) => void;
  onScheduleRecord: (item: AgendaItem, sectionId?: string) => void;
  onCreate: () => void;
}) {
  const journal = useQuery(learningJournal);
  const [category, setCategory] = useState("all");
  const [theme, setTheme] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(12);
  if (journal.error)
    return (
      <p className="error" role="alert">
        {journal.error}
      </p>
    );
  if (!journal.data) return <p role="status">記録を読み込み中…</p>;
  const categories = new Map(
    journal.data
      .filter((entry) => entry.category)
      .map((entry) => [categoryNameKey(entry.category), entry.category]),
  );
  const visible = filterJournal(journal.data, category, theme, search);
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>カテゴリ</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setLimit(12);
            }}
          >
            <option value="all">すべてのカテゴリ</option>
            <option value="unassigned">カテゴリなし</option>
            {[...categories]
              .sort((a, b) => a[1].localeCompare(b[1], "ja"))
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>キーワード</span>
          <input
            type="search"
            value={search}
            placeholder="内容・指摘・宿題を探す"
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(12);
            }}
          />
        </label>
        {themes.length > 0 && (
          <label className="field">
            <span>テーマ</span>
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                setLimit(12);
              }}
            >
              <option value="all">すべて</option>
              <option value="unassigned">テーマ未分類</option>
              {themes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="muted" role="status">
        {visible.length}件
      </p>
      <div className="learning-timeline">
        {visible.slice(0, limit).map((entry) => (
          <button
            type="button"
            className="card learning-note-card"
            key={entry.id}
            onClick={() => {
              if (entry.target.type === "note") onNote(entry.target.note);
              else onScheduleRecord(entry.target.item, entry.target.sectionId);
            }}
          >
            <div className="section-heading">
              <span>{dateLabel(entry.date)}</span>
              <span className="tag">{noteKinds[entry.kind]}</span>
            </div>
            <h3>{entry.category || entry.title}</h3>
            {entry.category && <p className="muted">{entry.title}</p>}
            {entry.fields
              .filter((field) => field.text.trim())
              .map((field) => (
                <div key={field.label} className="journal-field">
                  <small className="muted">{field.label}</small>
                  <p className="pre-wrap clamp">{field.text}</p>
                </div>
              ))}
            <small className="muted">
              {entry.attachmentCount > 0 &&
                `画像・動画 ${entry.attachmentCount}件 · `}
              {entry.youtubeCount > 0 && `YouTube ${entry.youtubeCount}件 · `}
              開いて見返す →
            </small>
          </button>
        ))}
      </div>
      {!visible.length && (
        <section className="card learning-empty">
          <MessageSquare size={28} />
          <h2>
            {journal.data.length
              ? "条件に合う記録はありません"
              : "学びをひとつ残しましょう"}
          </h2>
          <p>
            {journal.data.length
              ? "カテゴリやキーワードを変えて探せます。"
              : "予定に書いたカテゴリ別の内容も、ここに表示されます。"}
          </p>
          <button type="button" className="primary" onClick={onCreate}>
            記録する
          </button>
        </section>
      )}
      {visible.length > limit && (
        <button
          type="button"
          className="secondary"
          onClick={() => setLimit(limit + 12)}
        >
          さらに12件を見る
        </button>
      )}
    </>
  );
}
