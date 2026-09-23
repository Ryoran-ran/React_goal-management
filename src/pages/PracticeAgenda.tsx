import { DatePicker } from "../components/DatePicker";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  NotebookPen,
  UsersRound,
  SlidersHorizontal,
} from "lucide-react";
import { remove, save } from "../data/repository";
import {
  newPracticeEntry,
  openAgendaItem,
  type PracticeEntry,
  type PracticeAction,
} from "../lib/practiceNavigation";
import {
  agendaStatus,
  practiceAgenda,
  practiceAgendaRange,
} from "../data/practiceAgenda";
import { ensureLessonSchedules } from "../data/lessonSchedule";
import { milestoneDeadlines } from "../data/eventMilestones";
import { useQuery } from "../lib/hooks";
import { addDays, dateLabel, monthRange } from "../lib/dates";
import { shiftCalendarMonth } from "../lib/calendar";
import {
  readAgendaView,
  saveAgendaView,
  type AgendaView,
} from "../lib/agendaView";
import { lessonCategoryLabel } from "../lib/lessonCategories";
import { Empty } from "../components/ui";
import { FloatingAddButton } from "../components/FloatingAddButton";
import { LessonScheduleEditor } from "../components/LessonScheduleEditor";
import { LessonEditor } from "./Lessons";
import { PracticeEditor } from "../components/PracticeEditor";
import { scrollPageToTop } from "../lib/pageScroll";
import { confirmDiscardChanges } from "../lib/unsavedChanges";

const statuses = { planned: "予定", recorded: "記録済み", cancelled: "中止" };
export function Practice({
  today,
  entry,
  onEvent,
}: {
  today: string;
  entry?: PracticeEntry;
  onEvent: (id: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(
    entry?.type === "edit" ? entry.item.record.date : today,
  );
  const [view, setView] = useState<AgendaView>(readAgendaView);
  const changeView = (nextView: AgendaView) => {
    if (nextView === "week") setSelectedDate(today);
    setView(nextView);
    saveAgendaView(nextView);
    setNotice("");
  };
  const month = selectedDate.slice(0, 7);
  const weekEnd = addDays(selectedDate, 6);
  const period =
    view === "month"
      ? month
      : view === "week"
        ? `${selectedDate}:${weekEnd}`
        : selectedDate;
  const periodStart = view === "month" ? monthRange(month).start : selectedDate;
  const periodEnd =
    view === "month"
      ? monthRange(month).end
      : view === "week"
        ? weekEnd
        : selectedDate;
  const [filter, setFilter] = useState<"all" | ReturnType<typeof agendaStatus>>(
    "all",
  );
  const [editing, setEditing] = useState<
    Extract<PracticeEntry, { type: "edit" }> | undefined
  >(entry?.type === "edit" ? entry : undefined);
  const [scheduling, setScheduling] = useState(entry?.type === "schedule");
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    scrollPageToTop();
  }, [editing?.item.record.id, scheduling]);
  const result = useQuery(
    () =>
      view === "week"
        ? practiceAgendaRange(selectedDate, weekEnd)
        : practiceAgenda(view === "month" ? month : selectedDate),
    [period, !!editing, scheduling],
    () => ensureLessonSchedules(periodEnd),
  );
  const items = result.data?.filter(
    (item) => filter === "all" || agendaStatus(item) === filter,
  );
  const deadlines = useQuery(
    () => milestoneDeadlines(periodStart, periodEnd),
    [period],
  );
  const shownDeadlines =
    filter === "all" || filter === "planned" ? (deadlines.data ?? []) : [];
  const close = () => setEditing(undefined);
  const afterSave = (date: string) => {
    setSelectedDate(date);
    setFilter("all");
    close();
    setNotice("保存しました。一覧から選ぶと、内容を確認・編集できます。");
  };
  const create = (action: PracticeAction) => {
    setNotice("");
    const next = newPracticeEntry(
      action,
      view === "month" ? today : selectedDate,
    );
    if (next.type === "schedule") setScheduling(true);
    else setEditing(next);
  };
  const createPractice = () => create("practice");
  const createLesson = () => create("lesson");
  return (
    <>
      <header className="agenda-heading">
        <h1>予定</h1>
        {!editing && !scheduling && (
          <div className="agenda-heading-actions">
            <div
              className="segmented"
              role="group"
              aria-label="予定一覧の表示単位"
            >
              <button
                type="button"
                className={view === "month" ? "active" : ""}
                aria-pressed={view === "month"}
                aria-label="月ごとに表示"
                onClick={() => changeView("month")}
              >
                月
              </button>
              <button
                type="button"
                className={view === "week" ? "active" : ""}
                aria-pressed={view === "week"}
                aria-label="週ごとに表示"
                onClick={() => changeView("week")}
              >
                週
              </button>
              <button
                type="button"
                className={view === "day" ? "active" : ""}
                aria-pressed={view === "day"}
                aria-label="日ごとに表示"
                onClick={() => changeView("day")}
              >
                日
              </button>
            </div>
            <button
              type="button"
              className={`agenda-filter-toggle ${filter !== "all" ? "is-active" : ""}`}
              aria-expanded={showFilters}
              aria-label={
                filter === "all"
                  ? "予定を絞り込む"
                  : `絞り込み：${statuses[filter]}`
              }
              aria-controls="agenda-filters"
              onClick={() => setShowFilters((show) => !show)}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span>{filter === "all" ? "絞り込み" : statuses[filter]}</span>
            </button>
          </div>
        )}
      </header>
      {(editing || scheduling) && (
        <button
          className="text-button agenda-back"
          onClick={() => {
            if (!confirmDiscardChanges()) return;
            close();
            setScheduling(false);
          }}
        >
          <ArrowLeft size={18} />
          予定・記録の一覧に戻る
        </button>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {scheduling ? (
        <LessonScheduleEditor
          onClose={() => setScheduling(false)}
          onCreated={(count, date) => {
            setScheduling(false);
            setSelectedDate(date);
            setFilter("all");
            setNotice(`${count}回のレッスン予定を登録しました。`);
          }}
        />
      ) : editing?.item.kind === "lesson" ? (
        <LessonEditor
          key={editing.item.record.id}
          value={editing.item.record}
          exists={editing.exists}
          recording={editing.recording}
          initialSectionId={editing.sectionId}
          onClose={close}
          onSaved={afterSave}
        />
      ) : editing?.item.kind === "practice" ? (
        <PracticeEditor
          key={editing.item.record.id}
          value={editing.item.record}
          exists={editing.exists}
          recording={editing.recording}
          onClose={close}
          onSave={async (log, images) => {
            await save("practiceLogs", log, images.files, images.removed);
            afterSave(log.date);
          }}
          onDelete={async () => {
            await remove("practiceLogs", editing.item.record.id);
            close();
            setNotice("自主練習を削除しました。");
          }}
        />
      ) : (
        <>
          <div className="agenda-period-navigation">
            <button
              type="button"
              className="icon-button"
              aria-label={
                view === "day"
                  ? "前日の予定"
                  : view === "week"
                    ? "前の7日間の予定"
                    : "前月の予定"
              }
              onClick={() => {
                setSelectedDate(
                  view === "day"
                    ? addDays(selectedDate, -1)
                    : view === "week"
                      ? addDays(selectedDate, -7)
                      : `${shiftCalendarMonth(month, -1)}-01`,
                );
                setNotice("");
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <DatePicker
              aria-label={
                view === "month"
                  ? "表示する月"
                  : view === "week"
                    ? "表示を始める日"
                    : "表示する日"
              }
              type={view === "month" ? "month" : "date"}
              value={view === "month" ? month : selectedDate}
              onChange={(value) => {
                if (!value) return;
                setSelectedDate(
                  view === "month"
                    ? value === today.slice(0, 7)
                      ? today
                      : `${value}-01`
                    : value,
                );
                setNotice("");
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={
                view === "day"
                  ? "翌日の予定"
                  : view === "week"
                    ? "次の7日間の予定"
                    : "翌月の予定"
              }
              onClick={() => {
                setSelectedDate(
                  view === "day"
                    ? addDays(selectedDate, 1)
                    : view === "week"
                      ? addDays(selectedDate, 7)
                      : `${shiftCalendarMonth(month, 1)}-01`,
                );
                setNotice("");
              }}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {view === "week" && (
            <p className="agenda-week-range" aria-live="polite">
              {dateLabel(selectedDate)}〜{dateLabel(weekEnd)}の7日間
            </p>
          )}
          {showFilters && (
            <div id="agenda-filters" className="agenda-filter-panel">
              <label className="agenda-filter">
                表示する予定
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as typeof filter)
                  }
                >
                  <option value="all">すべて</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="card-list with-floating-add">
            {deadlines.error && (
              <p className="error" role="alert">
                準備の期限を読み込めませんでした：{deadlines.error}
              </p>
            )}
            {shownDeadlines.map(({ eventId, eventTitle, milestone }) => (
              <button
                key={`${eventId}-${milestone.id}`}
                type="button"
                className="card agenda-milestone"
                onClick={() => onEvent(eventId)}
              >
                <span className="tag">準備の期限</span>
                <strong>{milestone.title}</strong>
                <span>
                  {dateLabel(milestone.dueDate!)} · {eventTitle}
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            {result.error && (
              <p className="error" role="alert">
                {result.error}
              </p>
            )}
            {!result.data && !result.error && (
              <p role="status">予定を読み込み中…</p>
            )}
            {items?.map((item) => {
              const status = agendaStatus(item);
              const record = item.record;
              const title =
                record.title ||
                (item.kind === "practice" ? "自主練習" : "レッスン");
              const Icon = item.kind === "practice" ? NotebookPen : UsersRound;
              return (
                <div
                  className="schedule-learning-row"
                  key={`${item.kind}-${record.id}`}
                >
                  <button
                    key={`${item.kind}-${record.id}`}
                    className={`card agenda-row ${status === "cancelled" ? "is-cancelled" : status === "recorded" ? "is-completed" : ""}`}
                    onClick={() => {
                      setNotice("");
                      const next = openAgendaItem(item, today);
                      if (next.type === "edit") setEditing(next);
                    }}
                  >
                    <div className="agenda-date">
                      <CalendarDays size={18} />
                      <span>{dateLabel(record.date)}</span>
                      {record.date === today && (
                        <span className="tag green">今日</span>
                      )}
                    </div>
                    <div className="row-content">
                      <span className="muted agenda-kind">
                        <Icon size={16} />
                        {item.kind === "practice" ? "自主練習" : "レッスン"}
                      </span>
                      <h2>{title}</h2>
                      {item.kind === "lesson" &&
                        status === "cancelled" &&
                        item.record.cancellationReason && (
                          <p>中止理由：{item.record.cancellationReason}</p>
                        )}
                      {item.kind === "lesson" &&
                        !!item.record.sections?.length && (
                          <p>
                            {item.record.sections
                              .map(lessonCategoryLabel)
                              .join("・")}
                          </p>
                        )}
                      {record.durationMinutes !== undefined && (
                        <p>{record.durationMinutes}分</p>
                      )}
                      {item.kind === "practice" && (
                        <p className="clamp">
                          {status === "planned"
                            ? item.record.plannedNote
                            : item.record.whatWentWell || item.record.note}
                        </p>
                      )}
                    </div>
                    <div className="agenda-status">
                      <span
                        className={`tag ${status === "recorded" ? "completed" : status === "cancelled" ? "cancelled" : ""}`}
                      >
                        {status === "recorded" ? (
                          <>
                            <span aria-hidden="true">✓</span>
                            {item.kind === "lesson" ? "実施済み" : "記録済み"}
                          </>
                        ) : (
                          statuses[status]
                        )}
                      </span>
                      <span className="text-button">
                        {status === "planned"
                          ? record.date <= today
                            ? "記録する"
                            : "予定を確認"
                          : status === "recorded"
                            ? "記録を見る"
                            : "中止内容を確認"}
                        <ArrowUpRight size={16} />
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
            {items?.length === 0 &&
              !shownDeadlines.length &&
              !deadlines.error &&
              deadlines.data && (
                <section className="card">
                  <Empty>
                    {filter === "all"
                      ? `この${view === "day" ? "日" : view === "week" ? "7日間" : "月"}の予定はまだありません。左下の「追加」から登録できます。`
                      : "この条件に当てはまる予定・記録はありません。"}
                  </Empty>
                </section>
              )}
          </div>
          <FloatingAddButton
            actions={[
              { label: "自主練習を追加", onClick: createPractice },
              { label: "レッスンを1回追加", onClick: createLesson },
              {
                label: "毎週のレッスンをまとめて登録",
                onClick: () => {
                  setNotice("");
                  setScheduling(true);
                },
              },
            ]}
          />
        </>
      )}
    </>
  );
}
