import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type {
  DanceEvent,
  EventPracticeKind,
  EventPracticeSession,
  EventPracticeStatus,
  EventPracticeTemplate,
} from "../types";
import { base } from "../data/repository";
import {
  allEventPracticeTemplates,
  deleteEventPracticeSession,
  deleteEventPracticeTemplate,
  saveEventPracticeSession,
  saveEventPracticeTemplate,
  setEventPracticeStatus,
} from "../data/eventPractice";
import { calendarLessons } from "../data/calendarLessons";
import {
  eventPracticeDisplayStatus,
  eventPracticeKinds,
  eventPracticeStatuses,
  eventPracticeSummary,
  eventPracticeTitle,
  sortedEventPracticeSessions,
} from "../lib/eventPractice";
import {
  calendarDays,
  calendarWeekdays,
  readWeekStart,
  shiftCalendarMonth,
} from "../lib/calendar";
import { dateLabel, daysUntil, localDate } from "../lib/dates";
import { errorText, useQuery } from "../lib/hooks";
import { DatePicker } from "./DatePicker";
import { Field, SaveForm } from "./ui";

const displayStatusLabels = {
  planned: "予定",
  completed: "実施済み",
  missed: "未実施",
  cancelled: "中止",
} as const;

function newSession(
  date: string,
  kind: EventPracticeKind,
  template?: EventPracticeTemplate,
): EventPracticeSession {
  return {
    ...base(),
    date,
    kind,
    title: template?.title ?? "",
    status: "planned",
    memo: template?.memo ?? "",
    ...(template ? { templateId: template.id } : {}),
  };
}

export function EventPracticeCalendar({ event }: { event: DanceEvent }) {
  const today = localDate();
  const [month, setMonth] = useState(
    (today <= event.date ? today : event.date).slice(0, 7),
  );
  const [selectedDate, setSelectedDate] = useState<string>();
  const [editing, setEditing] = useState<EventPracticeSession>();
  const templates = useQuery(allEventPracticeTemplates);
  const summary = eventPracticeSummary(event, today);
  const showMonth = (next: string) => {
    setMonth(next);
    setSelectedDate(undefined);
    setEditing(undefined);
  };

  const days = calendarDays(month, readWeekStart());
  const lessons = useQuery(
    () => calendarLessons(days[0], days[days.length - 1]),
    [month],
  );
  const canNext = month < event.date.slice(0, 7);
  const remainingDays = daysUntil(event.date, today);
  return (
    <section className="card event-practice-card">
      <header className="section-heading event-practice-heading">
        <div>
          <h2>イベントまでの練習</h2>
          <p className="muted">
            日付を選んで、レッスンや自主練習の予定を登録します。
          </p>
        </div>
        <span className="tag">
          {remainingDays === 0
            ? "本番は今日"
            : remainingDays > 0
              ? `本番まであと${remainingDays}日`
              : `本番から${-remainingDays}日`}
        </span>
      </header>

      <div className="event-practice-stats" aria-label="練習回数の集計">
        <div className="is-upcoming">
          <span>練習回数</span>
          <strong>
            {summary.upcoming}
            <small>回</small>
          </strong>
        </div>
        <div className="is-completed">
          <span>実施済み</span>
          <strong>
            {summary.completed}
            <small>回</small>
          </strong>
        </div>
        <div className="is-missed">
          <span>未実施</span>
          <strong>
            {summary.missed}
            <small>回</small>
          </strong>
        </div>
        <div className="is-cancelled">
          <span>中止</span>
          <strong>
            {summary.cancelled}
            <small>回</small>
          </strong>
        </div>
      </div>

      <div className="event-practice-calendar">
        <div className="event-practice-month-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="前の月"
            onClick={() => showMonth(shiftCalendarMonth(month, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <DatePicker
            type="month"
            value={month}
            max={event.date.slice(0, 7)}
            aria-label="表示する月を選択"
            onChange={showMonth}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="次の月"
            disabled={!canNext}
            onClick={() => canNext && showMonth(shiftCalendarMonth(month, 1))}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="event-practice-weekdays" aria-hidden="true">
          {Array.from(
            { length: 7 },
            (_, index) => (readWeekStart() + index) % 7,
          ).map((weekday) => (
            <span
              key={weekday}
              className={
                weekday === 0
                  ? "calendar-sunday"
                  : weekday === 6
                    ? "calendar-saturday"
                    : ""
              }
            >
              {calendarWeekdays[weekday]}
            </span>
          ))}
        </div>
        <div className="event-practice-days">
          {days.map((date) => {
            const weekday = new Date(`${date}T12:00:00`).getDay();
            const sessions = (event.practiceSessions ?? []).filter(
              (session) => session.date === date,
            );
            const lessonCount = lessons.data?.[date]?.active ?? 0;
            const statuses = [
              ...new Set(
                sessions.map((session) =>
                  eventPracticeDisplayStatus(session, today),
                ),
              ),
            ];
            const afterEvent = date > event.date;
            return (
              <button
                type="button"
                key={date}
                disabled={afterEvent}
                aria-current={date === today ? "date" : undefined}
                aria-pressed={date === selectedDate}
                aria-label={`${dateLabel(date)}${date === today ? "、今日" : ""}${date === event.date ? "、本番" : ""}${lessonCount ? `、レッスン${lessonCount}件` : ""}${sessions.length ? `、練習予定${sessions.length}件` : ""}`}
                className={`event-practice-day ${weekday === 0 ? "calendar-sunday" : weekday === 6 ? "calendar-saturday" : ""} ${date.slice(0, 7) !== month ? "is-outside" : ""} ${lessonCount ? "has-lessons" : ""} ${date === today ? "is-today" : ""} ${date === event.date ? "is-event-day" : ""} ${date === selectedDate ? "is-selected" : ""}`}
                onClick={() => {
                  setEditing(undefined);
                  setSelectedDate((current) =>
                    current === date ? undefined : date,
                  );
                }}
              >
                <span className="event-practice-day-number">
                  {Number(date.slice(8))}
                </span>
                {date === today && <small>今日</small>}
                {date === event.date && <small>本番</small>}
                {sessions.length > 0 && (
                  <span className="event-practice-day-count">
                    {sessions.length}件
                  </span>
                )}
                {statuses.length > 0 && (
                  <span
                    className="event-practice-day-statuses"
                    aria-hidden="true"
                  >
                    {statuses.map((status) => (
                      <i key={status} className={`is-${status}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="event-practice-legend">
          <span>
            <i className="is-lesson" />
            レッスン予定あり
          </span>
          <span>
            <i className="is-planned" />
            予定
          </span>
          <span>
            <i className="is-completed" />
            実施済み
          </span>
          <span>
            <i className="is-missed" />
            未実施
          </span>
          <span>
            <i className="is-cancelled" />
            中止
          </span>
        </div>
        <footer className="event-practice-calendar-footer">
          <button
            type="button"
            className="secondary"
            disabled={today > event.date}
            title={
              today > event.date
                ? "開催済みイベントでは今日へ移動できません"
                : undefined
            }
            onClick={() => showMonth(today.slice(0, 7))}
          >
            今日へ
          </button>
        </footer>
      </div>
      {(editing || selectedDate) &&
        createPortal(
          <EventPracticeDialog
            onClose={() => {
              setEditing(undefined);
              setSelectedDate(undefined);
            }}
          >
            {editing ? (
              <EventPracticeEditor
                key={`${editing.id}-${editing.updatedAt}`}
                event={event}
                value={editing}
                exists={(event.practiceSessions ?? []).some(
                  (session) => session.id === editing.id,
                )}
                onClose={() => setEditing(undefined)}
                onSaved={(date) => {
                  setEditing(undefined);
                  setSelectedDate(date);
                  setMonth(date.slice(0, 7));
                }}
              />
            ) : selectedDate ? (
              <EventPracticeDay
                event={event}
                date={selectedDate}
                templates={templates.data ?? []}
                templateError={templates.error}
                onClose={() => setSelectedDate(undefined)}
                onEdit={setEditing}
                onAdd={(kind, template) =>
                  setEditing(newSession(selectedDate, kind, template))
                }
              />
            ) : null}
          </EventPracticeDialog>,
          document.body,
        )}
    </section>
  );
}

function EventPracticeDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="app-calendar event-practice-dialog"
      aria-label="練習予定"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="event-practice-dialog-content">{children}</div>
    </dialog>
  );
}

function EventPracticeDay({
  event,
  date,
  templates,
  templateError,
  onClose,
  onEdit,
  onAdd,
}: {
  event: DanceEvent;
  date: string;
  templates: EventPracticeTemplate[];
  templateError?: string;
  onClose: () => void;
  onEdit: (session: EventPracticeSession) => void;
  onAdd: (kind: EventPracticeKind, template?: EventPracticeTemplate) => void;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  const sessions = sortedEventPracticeSessions(
    (event.practiceSessions ?? []).filter((session) => session.date === date),
  );
  const today = localDate();
  const changeStatus = async (
    session: EventPracticeSession,
    status: EventPracticeStatus,
  ) => {
    setPending(session.id);
    setError("");
    try {
      await setEventPracticeStatus(event.id, session.id, status);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(undefined);
    }
  };
  return (
    <section className="event-practice-day-page">
      <header className="event-practice-day-heading">
        <div>
          <span className="eyebrow">
            {date === today
              ? "今日"
              : date === event.date
                ? "本番"
                : "練習予定"}
          </span>
          <h2>{dateLabel(date)}</h2>
        </div>
        <div className="event-practice-day-heading-actions">
          <span className="tag">{sessions.length}件</span>
          <button
            type="button"
            className="icon-button"
            aria-label="この日の予定を閉じる"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>

      {sessions.length ? (
        <div className="event-practice-session-list">
          {sessions.map((session) => {
            const displayStatus = eventPracticeDisplayStatus(session, today);
            const Icon =
              session.kind === "lesson"
                ? UsersRound
                : session.kind === "practice"
                  ? NotebookPen
                  : CalendarDays;
            return (
              <article className="event-practice-session" key={session.id}>
                <button
                  type="button"
                  className="event-practice-session-main"
                  onClick={() => onEdit(session)}
                >
                  <span className="icon-box">
                    <Icon size={19} />
                  </span>
                  <span>
                    <small>{eventPracticeKinds[session.kind]}</small>
                    <strong>{eventPracticeTitle(session)}</strong>
                    {session.memo && (
                      <span className="clamp">{session.memo}</span>
                    )}
                  </span>
                  <Pencil size={17} aria-hidden="true" />
                </button>
                <footer>
                  <span className={`event-practice-status is-${displayStatus}`}>
                    {displayStatusLabels[displayStatus]}
                  </span>
                  <label>
                    <span className="sr-only">
                      {eventPracticeTitle(session)}の状態
                    </span>
                    <select
                      value={session.status}
                      disabled={pending === session.id}
                      onChange={(changeEvent) =>
                        changeStatus(
                          session,
                          changeEvent.target.value as EventPracticeStatus,
                        )
                      }
                    >
                      {Object.entries(eventPracticeStatuses).map(
                        ([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty">この日の練習予定はまだありません。</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="event-practice-add">
        <h3>予定を追加</h3>
        <div className="event-practice-quick-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => onAdd("lesson")}
          >
            <UsersRound size={18} />
            レッスン
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onAdd("practice")}
          >
            <NotebookPen size={18} />
            自主練習
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onAdd("custom")}
          >
            <Plus size={18} />
            その他
          </button>
        </div>
        {templateError && (
          <p className="error" role="alert">
            {templateError}
          </p>
        )}
        {templates.length > 0 && (
          <div className="event-practice-templates">
            <h4>テンプレートから追加</h4>
            {templates.map((template) => (
              <div key={template.id}>
                <button type="button" onClick={() => onAdd("custom", template)}>
                  <Check size={16} />
                  <span>
                    <strong>{template.title}</strong>
                    {template.memo && <small>{template.memo}</small>}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${template.title}のテンプレートを削除`}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `「${template.title}」のテンプレートを削除しますか？`,
                      )
                    )
                      return;
                    try {
                      await deleteEventPracticeTemplate(template.id);
                    } catch (cause) {
                      setError(errorText(cause));
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function EventPracticeEditor({
  event,
  value,
  exists,
  onClose,
  onSaved,
}: {
  event: DanceEvent;
  value: EventPracticeSession;
  exists: boolean;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  const [session, setSession] = useState(value);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const patch = (change: Partial<EventPracticeSession>) =>
    setSession((current) => ({ ...current, ...change }));
  return (
    <section className="event-practice-inline-editor">
      <header className="section-heading">
        <h3>{exists ? "練習予定を編集" : "練習予定を追加"}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="練習予定の編集を閉じる"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <SaveForm
        onCancel={onClose}
        onDelete={
          exists
            ? async () => {
                await deleteEventPracticeSession(event.id, session.id);
                onSaved(session.date);
              }
            : undefined
        }
        deleteLabel="予定を削除"
        deleteConfirmation="この練習予定を削除しますか？ 実施しない予定として残す場合は、状態を「中止」にしてください。"
        onSave={async () => {
          let next = session;
          if (saveAsTemplate && session.kind === "custom") {
            const template: EventPracticeTemplate = {
              id: crypto.randomUUID(),
              title: session.title,
              memo: session.memo,
            };
            await saveEventPracticeTemplate(template);
            next = { ...session, templateId: template.id };
          }
          await saveEventPracticeSession(event.id, next);
          onSaved(next.date);
        }}
      >
        <Field label="種類">
          <select
            value={session.kind}
            onChange={(changeEvent) =>
              patch({ kind: changeEvent.target.value as EventPracticeKind })
            }
          >
            {Object.entries(eventPracticeKinds).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={session.kind === "custom" ? "予定名" : "予定名（任意）"}>
          <input
            required={session.kind === "custom"}
            maxLength={200}
            value={session.title}
            placeholder={
              session.kind === "lesson"
                ? "例：個人レッスン"
                : session.kind === "practice"
                  ? "例：体育館で自主練習"
                  : "例：本番リハーサル"
            }
            onChange={(inputEvent) => patch({ title: inputEvent.target.value })}
          />
        </Field>
        <Field label="日付">
          <DatePicker
            required
            type="date"
            value={session.date}
            max={event.date}
            onChange={(date) => patch({ date })}
          />
        </Field>
        <Field label="状態">
          <select
            value={session.status}
            onChange={(changeEvent) =>
              patch({ status: changeEvent.target.value as EventPracticeStatus })
            }
          >
            {Object.entries(eventPracticeStatuses).map(([status, label]) => (
              <option value={status} key={status}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="メモ">
          <textarea
            maxLength={5000}
            value={session.memo}
            placeholder="練習内容、確認したいこと、持ち物など"
            onChange={(inputEvent) => patch({ memo: inputEvent.target.value })}
          />
        </Field>
        {session.kind === "custom" && !exists && !session.templateId && (
          <label className="choice event-practice-template-choice">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(changeEvent) =>
                setSaveAsTemplate(changeEvent.target.checked)
              }
            />
            この名前とメモをテンプレートとして保存
          </label>
        )}
      </SaveForm>
    </section>
  );
}
