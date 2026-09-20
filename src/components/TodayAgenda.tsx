import { ArrowRight, NotebookPen, UsersRound } from "lucide-react";
import {
  agendaBetween,
  agendaStatus,
  type AgendaItem,
} from "../data/practiceAgenda";
import { addDays, dateLabel } from "../lib/dates";
import { useQuery } from "../lib/hooks";
import { ensureLessonSchedules } from "../data/lessonSchedule";

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
  const todays = data?.filter((item) => item.record.date === today) ?? [];
  const upcoming =
    data?.filter(
      (item) => item.record.date > today && agendaStatus(item) === "planned",
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
        className="today-agenda-row"
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
          {recorded && <span className="tag green">記録済み</span>}
        </span>
        <span className="today-agenda-action">
          {action}
          <ArrowRight size={17} />
        </span>
      </button>
    );
  }
  return (
    <section className="card today-agenda">
      <header className="section-heading">
        <h2>今日の自主練習・レッスン</h2>
        <span className="tag">{todays.length}件</span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">予定を読み込み中…</p>}
      {data && !todays.length && (
        <div className="empty">
          <p>今日の予定はまだありません。</p>
          <p>
            左下の＋から自主練習やレッスンを追加できます。目標や計画が未設定でも始められます。
          </p>
        </div>
      )}
      {todays.map(row)}
      {upcoming.length > 0 && (
        <div className="today-upcoming">
          <h3>これから7日間の予定</h3>
          {upcoming.map(row)}
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
