import { useId, useMemo, useState } from "react";
import { ArrowLeft, MapPin, Plus, Search, X } from "lucide-react";
import type { DanceEvent } from "../types";
import { dateLabel } from "../lib/dates";

const searchKey = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja").replaceAll(/\s+/g, "");

const eventMeta = (event: DanceEvent) =>
  [
    `${event.date.slice(0, 4)}年${dateLabel(event.date)}`,
    event.location?.trim(),
  ]
    .filter(Boolean)
    .join(" ・ ");

export function EventSelectionScreen({
  events,
  value,
  context,
  onChange,
  onBack,
}: {
  events: DanceEvent[];
  value: string[];
  context: string;
  onChange: (ids: string[]) => void;
  onBack: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const selected = value
    .map((id) => events.find((event) => event.id === id))
    .filter((event): event is DanceEvent => !!event);
  const options = useMemo(() => {
    const key = searchKey(query);
    return events
      .filter((event) => !value.includes(event.id))
      .filter(
        (event) =>
          !key ||
          searchKey(
            [event.title, event.location, event.date, dateLabel(event.date)]
              .filter(Boolean)
              .join(" "),
          ).includes(key),
      );
  }, [events, query, value]);

  return (
    <section className="editor card event-selection-screen">
      <header className="goal-selection-header">
        <button type="button" className="text-button" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          戻る
        </button>
        <h2>関連イベントを選ぶ</h2>
      </header>
      <p className="event-selection-context">
        「{context}」のレッスン内容に関連付けるイベントを選びます。
      </p>

      <section
        className="event-selection-block"
        aria-labelledby="selected-events-heading"
      >
        <div className="event-selection-heading">
          <h3 id="selected-events-heading">選択中</h3>
          <span className="tag">{selected.length}件</span>
        </div>
        {selected.length > 0 ? (
          <ul className="selected-event-list">
            {selected.map((event) => (
              <li key={event.id}>
                <span>
                  <strong>{event.title}</strong>
                  <small>{eventMeta(event)}</small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${event.title}の関連付けを外す`}
                  onClick={() =>
                    onChange(value.filter((eventId) => eventId !== event.id))
                  }
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="event-selection-empty">まだ選択されていません。</p>
        )}
      </section>

      <section
        className="event-selection-block"
        aria-labelledby="event-search-heading"
      >
        <div className="event-selection-heading">
          <h3 id="event-search-heading">イベントを検索</h3>
        </div>
        <label className="event-search-input" htmlFor={inputId}>
          <Search size={18} aria-hidden="true" />
          <input
            id={inputId}
            className="event-search-control"
            type="text"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="イベント名・場所・日付で検索"
            aria-label="イベント名・場所・日付で検索"
            autoComplete="off"
          />
        </label>
        <p className="event-search-hint">
          <MapPin size={14} aria-hidden="true" />
          登録済みのイベントを名前・場所・日付から検索できます。
        </p>
        {options.length ? (
          <ul
            className="event-search-results"
            aria-label={
              query.trim() ? "イベントの検索結果" : "選択できるイベント"
            }
          >
            {options.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, event.id]);
                    setQuery("");
                  }}
                >
                  <span>
                    <strong>{event.title}</strong>
                    <small>{eventMeta(event)}</small>
                  </span>
                  <Plus size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="event-search-empty">
            {query.trim()
              ? "一致するイベントはありません。"
              : "選択できるイベントはありません。"}
          </p>
        )}
      </section>

      <footer className="form-actions">
        <div className="spacer" />
        <button type="button" className="primary" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          選択を確定して戻る
        </button>
      </footer>
    </section>
  );
}
