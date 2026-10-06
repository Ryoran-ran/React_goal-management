import {
  ArrowRight,
  CalendarDays,
  NotebookPen,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import {
  agendaBetween,
  agendaStatus,
  type AgendaItem,
} from "../data/practiceAgenda";
import { addDays, dateLabel } from "../lib/dates";
import { useQuery } from "../lib/hooks";
import { ensureLessonSchedules } from "../data/lessonSchedule";
import {
  eventPracticeBetween,
  setEventPracticeStatus,
} from "../data/eventPractice";
import {
  eventPracticeKinds,
  eventPracticeStatuses,
  eventPracticeTitle,
} from "../lib/eventPractice";
import { errorText } from "../lib/hooks";
import type { EventPracticeStatus } from "../types";

export function TodayAgenda({
  today,
  onOpen,
  onList,
}: {
  today: string;
  onOpen: (item: AgendaItem) => void;
  onList: () => void;
}) {
  const { data, error } = useQuery(
    () => agendaBetween(today, addDays(today, 7)),
    [today],
    () => ensureLessonSchedules(addDays(today, 7)),
  );
  const eventPractices = useQuery(
    () => eventPracticeBetween(today, addDays(today, 7)),
    [today],
  );
  const [practiceError, setPracticeError] = useState("");
  const [pending, setPending] = useState<string>();
  const todays = data?.filter((item) => item.record.date === today) ?? [];
  const todaysEventPractices =
    eventPractices.data?.filter((item) => item.session.date === today) ?? [];
  const upcoming =
    data?.filter(
      (item) => item.record.date > today && agendaStatus(item) === "planned",
    ) ?? [];
  const upcomingEventPractices =
    eventPractices.data?.filter(
      (item) => item.session.date > today && item.session.status === "planned",
    ) ?? [];
  function row(item: AgendaItem) {
    const recorded = agendaStatus(item) === "recorded";
    const Icon = item.kind === "lesson" ? UsersRound : NotebookPen;
    const action = recorded
      ? "記録を見る"
      : item.record.date === today
        ? "記録する"
        : "予定を確認";
    return (
      <button
        className={`today-agenda-row ${recorded ? "is-completed" : ""}`}
        key={`${item.kind}-${item.record.id}`}
        onClick={() => onOpen(item)}
      >
        <span className="icon-box">
          <Icon size={20} />
        </span>
        <span className="today-agenda-body">
          <span className="muted">
            {item.kind === "lesson" ? "レッスン" : "自主練習"}
            {item.record.date !== today && ` · ${dateLabel(item.record.date)}`}
          </span>
          <strong>
            {item.record.title ||
              (item.kind === "lesson" ? "レッスン" : "自主練習")}
          </strong>
          {recorded && (
            <span className="tag completed">
              <span aria-hidden="true">✓</span>
              {item.kind === "lesson" ? "実施済み" : "記録済み"}
            </span>
          )}
        </span>
        <span className="today-agenda-action">
          {action}
          <ArrowRight size={17} />
        </span>
      </button>
    );
  }
  function eventPracticeRow({
    event,
    session,
  }: Awaited<ReturnType<typeof eventPracticeBetween>>[number]) {
    const Icon =
      session.kind === "lesson"
        ? UsersRound
        : session.kind === "practice"
          ? NotebookPen
          : CalendarDays;
    return (
      <article
        className={`today-agenda-row event-practice-agenda-row ${
          session.status === "completed" ? "is-completed" : ""
        }`}
        key={`event-practice-${event.id}-${session.id}`}
      >
        <span className="icon-box">
          <Icon size={20} />
        </span>
        <span className="today-agenda-body">
          <span className="muted">
            {eventPracticeKinds[session.kind]} · {event.title}
            {session.date !== today && ` · ${dateLabel(session.date)}`}
          </span>
          <strong>{eventPracticeTitle(session)}</strong>
          {session.memo && <span className="clamp muted">{session.memo}</span>}
        </span>
        <label className="event-practice-agenda-status">
          <span className="sr-only">{eventPracticeTitle(session)}の状態</span>
          <select
            value={session.status}
            disabled={pending === session.id}
            onChange={async (changeEvent) => {
              setPending(session.id);
              setPracticeError("");
              try {
                await setEventPracticeStatus(
                  event.id,
                  session.id,
                  changeEvent.target.value as EventPracticeStatus,
                );
              } catch (cause) {
                setPracticeError(errorText(cause));
              } finally {
                setPending(undefined);
              }
            }}
          >
            {Object.entries(eventPracticeStatuses).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </article>
    );
  }
  return (
    <section className="card today-agenda">
      <header className="section-heading">
        <h2>今日の自主練習・レッスン</h2>
        <span className="tag">
          {todays.length + todaysEventPractices.length}件
        </span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(eventPractices.error || practiceError) && (
        <p className="error" role="alert">
          {eventPractices.error || practiceError}
        </p>
      )}
      {(!data || !eventPractices.data) && !error && !eventPractices.error && (
        <p role="status">予定を読み込み中…</p>
      )}
      {data &&
        eventPractices.data &&
        !todays.length &&
        !todaysEventPractices.length && (
          <div className="empty">
            <p>今日の予定はまだありません。</p>
            <p>
              左下の＋から自主練習やレッスンを追加できます。目標や計画が未設定でも始められます。
            </p>
          </div>
        )}
      {todays.map(row)}
      {todaysEventPractices.map(eventPracticeRow)}
      {(upcoming.length > 0 || upcomingEventPractices.length > 0) && (
        <div className="today-upcoming">
          <h3>これから7日間の予定</h3>
          {upcoming.map(row)}
          {upcomingEventPractices.map(eventPracticeRow)}
        </div>
      )}
      <footer className="card-footer">
        <button className="text-button" onClick={onList}>
          すべての予定・過去の記録を見る
          <ArrowRight size={17} />
        </button>
      </footer>
    </section>
  );
}
