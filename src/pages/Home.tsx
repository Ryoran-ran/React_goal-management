import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Target,
} from "lucide-react";
import { useState } from "react";
import { home, toggleTask } from "../data/repository";
import { ensureLessonSchedules } from "../data/lessonSchedule";
import { useQuery, errorText } from "../lib/hooks";
import { addDays, dateLabel, weekOf } from "../lib/dates";
import { Empty, Progress } from "../components/ui";
import { FloatingAddButton } from "../components/FloatingAddButton";
import { TodayAgenda } from "../components/TodayAgenda";
import { UpcomingEvents } from "../components/UpcomingEvents";
import type { AgendaItem } from "../data/practiceAgenda";
import type { PracticeAction } from "../lib/practiceNavigation";
import { goalLabel } from "../lib/goalCategories";
import { lessonHomework } from "../lib/lessonContent";
export type Page = "home" | "practice" | "plans" | "goals" | "events";
export function Home({
  today,
  navigate,
  onOpenAgenda,
  onAdd,
}: {
  today: string;
  navigate: (page: Page) => void;
  onOpenAgenda: (item: AgendaItem) => void;
  onAdd: (action: PracticeAction) => void;
}) {
  const { data, error } = useQuery(
    () => home(today),
    [today],
    () => ensureLessonSchedules(addDays(today, 55)),
  );
  const [taskError, setTaskError] = useState("");
  const [pending, setPending] = useState<string>();
  if (error)
    return (
      <p className="error" role="alert">
        データを読み込めませんでした：{error}
      </p>
    );
  if (!data) return <p role="status">練習ノートを開いています…</p>;
  const {
    monthlyPlan,
    weeklyPlan,
    todayLog,
    nextLesson,
    goals,
    events,
    weekLogs,
  } = data;
  const practicedDays = weekLogs.filter((l) => l.practiced).length;
  const minutes = weekLogs.reduce(
    (total, log) => total + (log.practiced ? (log.durationMinutes ?? 0) : 0),
    0,
  );
  const unfinished = weeklyPlan?.tasks.filter((t) => !t.completed) ?? [];
  const week = weekOf(today);
  const focus = goals.filter((g) => monthlyPlan?.focusGoalIds.includes(g.id));
  return (
    <>
      <header className="home-heading">
        <div>
          <span className="eyebrow">
            {new Date(`${today}T12:00:00`).getFullYear()} / {dateLabel(today)}
          </span>
          <h1>今日の予定</h1>
          <p>予定を選んで、練習やレッスンの内容を記録しましょう。</p>
        </div>
      </header>
      <FloatingAddButton
        actions={[
          { label: "自主練習を追加", onClick: () => onAdd("practice") },
          { label: "レッスンを1回追加", onClick: () => onAdd("lesson") },
          {
            label: "毎週のレッスンをまとめて登録",
            onClick: () => onAdd("schedule"),
          },
        ]}
      />
      <div className="home-grid home-workflow-grid">
        <TodayAgenda
          today={today}
          onOpen={onOpenAgenda}
          onList={() => navigate("practice")}
        />
        <UpcomingEvents
          events={events}
          today={today}
          onManage={() => navigate("events")}
        />
      </div>
      <details className="home-planning with-floating-add">
        <summary>目標・計画と進捗を確認</summary>
        <div className="home-grid">
          <section className="card today-card">
            <header className="section-heading">
              <h2>
                <span className="icon-box">
                  <Check size={19} />
                </span>
                今日取り組むこと
              </h2>
              <span className="tag">今週の計画から</span>
            </header>
            {weeklyPlan?.focusGoalIds.length ? (
              <div className="focus-tags">
                {goals
                  .filter((g) => weeklyPlan.focusGoalIds.includes(g.id))
                  .map((g) => (
                    <div className="home-focus-detail" key={g.id}>
                      <span className="tag green">{goalLabel(g)}</span>
                      {weeklyPlan.focusDetails?.[g.id] && (
                        <p className="pre-wrap muted">
                          {weeklyPlan.focusDetails[g.id]}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            ) : null}
            <div className="tasks">
              {weeklyPlan?.tasks.length ? (
                weeklyPlan.tasks.map((task) => (
                  <label
                    className={`task ${task.completed ? "done" : ""}`}
                    key={task.id}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      disabled={pending !== undefined}
                      onChange={async (e) => {
                        setPending(task.id);
                        setTaskError("");
                        try {
                          await toggleTask(
                            weeklyPlan.id,
                            task.id,
                            e.target.checked,
                          );
                        } catch (e) {
                          setTaskError(errorText(e));
                        } finally {
                          setPending(undefined);
                        }
                      }}
                    />
                    <span>{task.title}</span>
                  </label>
                ))
              ) : (
                <Empty
                  action="今週の練習を決める"
                  onAction={() => navigate("plans")}
                >
                  今週、取り組みたい練習は何ですか？
                </Empty>
              )}
            </div>
            {taskError && (
              <p role="alert" className="error">
                {taskError}
              </p>
            )}
            <footer className="card-footer">
              <span>
                {weeklyPlan?.tasks.length
                  ? `${weeklyPlan.tasks.filter((t) => t.completed).length} / ${weeklyPlan.tasks.length} 完了`
                  : "小さな練習から始めましょう"}
              </span>
              <button className="text-button" onClick={() => navigate("plans")}>
                計画を見直す
                <ArrowUpRight size={16} />
              </button>
            </footer>
          </section>
          <section className="card week-summary">
            <header className="section-heading">
              <h2>今週の積み重ね</h2>
              <span className="muted">{dateLabel(week.startDate)}〜</span>
            </header>
            <div className="week-days">
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(week.startDate, i);
                const log = weekLogs.find((l) => l.date === day);
                return (
                  <div key={day} className={day === today ? "is-today" : ""}>
                    <span>{["月", "火", "水", "木", "金", "土", "日"][i]}</span>
                    <div
                      className={`day-dot ${log?.practiced ? "practiced" : ""}`}
                    >
                      {log?.practiced ? (
                        <Check size={17} />
                      ) : (
                        Number(day.slice(8))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="stat-row">
              <div>
                <strong>
                  {practicedDays}
                  <small>日</small>
                </strong>
                <span>練習した日</span>
              </div>
              <div>
                <strong>
                  {minutes}
                  <small>分</small>
                </strong>
                <span>今週の練習時間</span>
              </div>
              <div>
                <strong>
                  {unfinished.length}
                  <small>件</small>
                </strong>
                <span>今週の未完了項目</span>
              </div>
            </div>
          </section>
          <section className="card">
            <header className="section-heading">
              <h2>
                <CalendarDays size={20} />
                次回レッスン
              </h2>
            </header>
            {nextLesson ? (
              <>
                <span className="lesson-date">
                  {dateLabel(nextLesson.date)}
                </span>
                <h3>{nextLesson.title || "レッスン"}</h3>
                <ul className="topic-list">
                  {[...nextLesson.plannedTopics]
                    .sort(
                      (a, b) =>
                        ["high", "medium", "low"].indexOf(a.priority) -
                        ["high", "medium", "low"].indexOf(b.priority),
                    )
                    .slice(0, 3)
                    .map((t) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                </ul>
              </>
            ) : (
              <Empty>次のレッスンはまだありません。</Empty>
            )}
            <button
              className="text-button"
              onClick={() =>
                nextLesson
                  ? onOpenAgenda({ kind: "lesson", record: nextLesson })
                  : onAdd("lesson")
              }
            >
              {nextLesson ? "レッスンを開く" : "レッスンを予定する"}
              <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="card month-focus">
            <header className="section-heading">
              <h2>
                <Target size={20} />
                {Number(today.slice(5, 7))}月の重点目標
              </h2>
              <button className="text-button" onClick={() => navigate("plans")}>
                月次計画
                <ArrowUpRight size={16} />
              </button>
            </header>
            {focus.length ? (
              focus.map((g) => (
                <div className="focus-item" key={g.id}>
                  <span>{goalLabel(g)}</span>
                  {monthlyPlan?.focusDetails?.[g.id] && (
                    <p className="pre-wrap muted">
                      {monthlyPlan.focusDetails[g.id]}
                    </p>
                  )}
                  <Progress value={g.progress} />
                </div>
              ))
            ) : (
              <Empty
                action="今月の重点を選ぶ"
                onAction={() => navigate("plans")}
              >
                伸ばしたい技術に、集中するひと月を。
              </Empty>
            )}
            {monthlyPlan?.objectives.map((o) => (
              <div key={o.id} className="objective-summary">
                <span>
                  {o.completed ? "✓" : "○"} {o.title}
                </span>
                <small>{o.progress}%</small>
              </div>
            ))}
          </section>
          <section className="card note-card">
            <header className="section-heading">
              <h2>
                <Clock3 size={20} />
                今日の記録
              </h2>
              <span className="tag">{todayLog ? "記録済み" : "未記録"}</span>
            </header>
            {todayLog ? (
              <>
                <h3>
                  {todayLog.practiced
                    ? `${todayLog.durationMinutes ?? 0}分の練習`
                    : "今日は休息の日"}
                </h3>
                <p className="clamp">
                  {todayLog.whatWentWell ||
                    todayLog.note ||
                    "今日の一歩を記録しました。"}
                </p>
              </>
            ) : (
              <p>
                練習の気づきは、次の一歩のヒント。
                <br />
                ひと言から残しておきましょう。
              </p>
            )}
            <button
              className="text-button"
              onClick={() =>
                todayLog
                  ? onOpenAgenda({ kind: "practice", record: todayLog })
                  : navigate("practice")
              }
            >
              {todayLog ? "今日の記録を見る" : "予定から記録する"}
              <ArrowUpRight size={16} />
            </button>
          </section>
          {lessonHomework(data.lastLesson) && (
            <section className="card">
              <header className="section-heading">
                <h2>前回のレッスンから</h2>
              </header>
              <p className="pre-wrap">{lessonHomework(data.lastLesson)}</p>
              <button
                className="text-button"
                onClick={() =>
                  data.lastLesson &&
                  onOpenAgenda({ kind: "lesson", record: data.lastLesson })
                }
              >
                宿題を確認
                <ArrowUpRight size={16} />
              </button>
            </section>
          )}
        </div>
      </details>
    </>
  );
}
