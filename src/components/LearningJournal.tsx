import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  MessageSquare,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import {
  learningJournal,
  filterJournal,
  type JournalEntry,
} from "../data/learningJournal";
import type { DanceEvent, LearningTheme } from "../types";
import { useQuery } from "../lib/hooks";
import { dateLabel } from "../lib/dates";
import { categoryNameKey } from "../lib/lessonCategories";
import { youtubeLink } from "../lib/lessonContent";
import { parseLessonOutline } from "../lib/lessonOutline";
import { noteKinds } from "./LearningNoteEditor";
import { LessonOutline } from "./LessonOutline";
import { AttachmentViewer } from "./AttachmentViewer";

export function LearningJournal({
  themes,
  onOpen,
  onCreate,
}: {
  themes: LearningTheme[];
  onOpen: (id: string) => void;
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
  const activeFilterCount =
    Number(category !== "all") + Number(theme !== "all");

  return (
    <>
      <div className="journal-tools">
        <label className="field journal-search-field">
          <span>キーワード</span>
          <input
            type="search"
            value={search}
            placeholder="内容・指摘・宿題を探す"
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(12);
            }}
          />
        </label>
        <details className="journal-filter-details">
          <summary>
            <span>
              <SlidersHorizontal size={17} aria-hidden="true" />
              カテゴリ・テーマで絞り込む
            </span>
            {activeFilterCount > 0 && (
              <span className="tag green">{activeFilterCount}件適用中</span>
            )}
          </summary>
          <div className="journal-filter-grid">
            <label className="field">
              <span>カテゴリ</span>
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
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
            {themes.length > 0 && (
              <label className="field">
                <span>テーマ</span>
                <select
                  value={theme}
                  onChange={(event) => {
                    setTheme(event.target.value);
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
        </details>
      </div>

      <div className="journal-result-heading">
        <strong role="status">{visible.length}件の記録</strong>
        {(search.trim() || activeFilterCount > 0) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setTheme("all");
              setLimit(12);
            }}
          >
            条件をクリア
          </button>
        )}
      </div>

      <div className="learning-timeline journal-list">
        {visible.slice(0, limit).map((entry) => {
          const fields = entry.fields.filter((field) => field.text.trim());
          const previews = fields.slice(0, 3);
          const hiddenFieldCount = fields.length - previews.length;
          return (
            <button
              type="button"
              className="card learning-note-card journal-card"
              key={entry.id}
              onClick={() => onOpen(entry.id)}
            >
              <div className="journal-card-top">
                <span className="journal-card-date">
                  <CalendarDays size={15} aria-hidden="true" />
                  {dateLabel(entry.date)}
                </span>
                <span className="tag">{noteKinds[entry.kind]}</span>
              </div>
              <div className="journal-card-heading">
                <h3>{entry.category || entry.title}</h3>
                {entry.category && <p>{entry.title}</p>}
              </div>
              {previews.length > 0 && (
                <div className="journal-card-fields">
                  {previews.map((field) => (
                    <div key={field.label} className="journal-field-compact">
                      <small>{field.label}</small>
                      <p className="pre-wrap clamp">
                        {entry.kind === "lesson"
                          ? parseLessonOutline(field.text)
                              .map((item) => item.text)
                              .join(" ・ ")
                          : field.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="journal-card-footer">
                <span className="journal-card-meta">
                  {hiddenFieldCount > 0 && `ほか${hiddenFieldCount}項目`}
                  {entry.attachmentCount > 0 &&
                    `${hiddenFieldCount > 0 ? " ・ " : ""}画像・動画 ${entry.attachmentCount}件`}
                  {entry.youtubeCount > 0 &&
                    `${hiddenFieldCount > 0 || entry.attachmentCount > 0 ? " ・ " : ""}YouTube ${entry.youtubeCount}件`}
                </span>
                <span className="journal-card-open">
                  詳しく見る
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
              </div>
            </button>
          );
        })}
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

export function LearningJournalDetail({
  id,
  events,
  onBack,
  onEdit,
  onEvent,
}: {
  id: string;
  events: DanceEvent[];
  onBack: () => void;
  onEdit: (entry: JournalEntry) => void;
  onEvent: (id: string) => void;
}) {
  const journal = useQuery(learningJournal, [id]);
  if (journal.error)
    return (
      <p className="error" role="alert">
        {journal.error}
      </p>
    );
  if (!journal.data) return <p role="status">記録を開いています…</p>;
  const entry = journal.data.find((item) => item.id === id);
  if (!entry)
    return (
      <section className="card">
        <p>この記録は見つかりませんでした。</p>
        <button type="button" className="text-button" onClick={onBack}>
          学びの記録に戻る
        </button>
      </section>
    );

  const relatedEvents = entry.relatedEventIds
    .map((eventId) => events.find((event) => event.id === eventId))
    .filter((event): event is DanceEvent => !!event);
  const attachmentTarget =
    entry.target.type === "note"
      ? { type: "learning" as const, id: entry.target.note.id }
      : {
          type: entry.target.item.kind,
          id: entry.target.item.record.id,
          sectionId: entry.target.sectionId,
        };
  const youtubeUrls = entry.youtubeUrls
    .map((url) => youtubeLink(url))
    .filter((url): url is string => !!url);

  return (
    <div className="learning-page journal-detail-page">
      <button
        type="button"
        className="text-button journal-detail-back"
        onClick={onBack}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        学びの記録に戻る
      </button>

      <header className="journal-detail-heading">
        <div className="journal-card-top">
          <span className="journal-card-date">
            <CalendarDays size={16} aria-hidden="true" />
            {dateLabel(entry.date)}
          </span>
          <span className="tag">{noteKinds[entry.kind]}</span>
        </div>
        <h1>{entry.category || entry.title}</h1>
        {entry.category && <p>{entry.title}</p>}
        <button
          type="button"
          className="secondary"
          onClick={() => onEdit(entry)}
        >
          <Pencil size={17} aria-hidden="true" />
          編集する
        </button>
      </header>

      {relatedEvents.length > 0 && (
        <section
          className="card journal-related-events"
          aria-labelledby="journal-events-heading"
        >
          <h2 id="journal-events-heading">関連イベント</h2>
          {relatedEvents.map((event) => (
            <button
              type="button"
              className="journal-related-event"
              key={event.id}
              onClick={() => onEvent(event.id)}
            >
              <span>
                <strong>{event.title}</strong>
                <small>{dateLabel(event.date)}</small>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      <div className="journal-detail-sections">
        {entry.fields
          .filter((field) => field.text.trim())
          .map((field) => {
            const isNextAction = /宿題|次に試す|改善したい/.test(field.label);
            return (
              <section
                className={`card journal-detail-section ${isNextAction ? "is-next-action" : ""}`}
                key={field.label}
              >
                <h2>{field.label}</h2>
                {entry.kind === "lesson" ? (
                  <LessonOutline text={field.text} />
                ) : (
                  <p className="pre-wrap">{field.text}</p>
                )}
              </section>
            );
          })}
      </div>

      <AttachmentViewer {...attachmentTarget} />

      {youtubeUrls.length > 0 && (
        <section
          className="journal-detail-resources"
          aria-labelledby="journal-youtube-heading"
        >
          <h2 id="journal-youtube-heading">YouTube</h2>
          <div className="journal-youtube-list">
            {youtubeUrls.map((url, index) => (
              <a
                className="secondary"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                key={`${url}-${index}`}
              >
                動画 {index + 1}を開く
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
