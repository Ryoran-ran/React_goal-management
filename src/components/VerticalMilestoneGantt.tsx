import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import type {
  DanceEvent,
  EventMilestone,
  EventWorkItem,
  MilestonePlan,
} from "../types";
import { addDays, daysUntil, localDate } from "../lib/dates";
import {
  ganttDayStart,
  ganttPosition,
  ganttSegment,
  scheduleTiming,
  type GanttScale,
} from "../lib/milestones";
import { workOverview } from "../lib/verticalGantt";
import { ScheduleStatus } from "./ScheduleStatus";

export function VerticalMilestoneGantt({
  event,
  items,
  workItems,
  range,
  scale,
  onEdit,
  onEditWork,
}: {
  event: DanceEvent;
  items: EventMilestone[];
  workItems: EventWorkItem[];
  range: { start: string; end: string };
  scale: GanttScale;
  onEdit: (item: EventMilestone) => void;
  onEditWork: (item: EventWorkItem) => void;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const today = localDate();
  const count = daysUntil(range.end, range.start) + 1;
  const height = Math.max(
    320,
    Math.min(
      2400,
      count * (scale === "week" ? 48 : scale === "month" ? 28 : 24),
    ),
  );
  const stride = Math.max(1, Math.ceil(count / Math.floor(height / 24)));
  const dates = Array.from({ length: Math.ceil(count / stride) }, (_, index) =>
    addDays(range.start, index * stride),
  );
  const allWork = event.workItems ?? [];
  type Column = {
    key: string;
    title: string;
    milestone?: EventMilestone;
    work?: EventWorkItem;
    children: EventWorkItem[];
    allChildren: EventWorkItem[];
    parentTitle?: string;
  };
  const groups: Column[] = items.map((item) => ({
    key: `milestone:${item.id}`,
    title: item.title,
    milestone: item,
    children: workItems.filter((work) => work.milestoneId === item.id),
    allChildren: allWork.filter((work) => work.milestoneId === item.id),
  }));
  const unassigned = workItems.filter((work) => !work.milestoneId);
  if (unassigned.length)
    groups.push({
      key: "unassigned",
      title: "未分類の作業",
      children: unassigned,
      allChildren: allWork.filter((work) => !work.milestoneId),
    });
  const visibleExpanded = expanded.filter((key) =>
    groups.some((group) => group.key === key && group.children.length > 0),
  );
  const columns = groups.flatMap((group) => [
    group,
    ...(visibleExpanded.includes(group.key)
      ? group.children.map((work): Column => ({
          key: `work:${work.id}`,
          title: work.title,
          parentTitle: group.title,
          work,
          children: [],
          allChildren: [],
        }))
      : []),
  ]);
  const inRange = (date?: string) =>
    !!date && date >= range.start && date <= range.end;
  const line = (date: string, kind: string) =>
    inRange(date) ? (
      <span
        className={`vertical-date-line ${kind}`}
        style={{
          top: `${kind === "today" ? ganttPosition(date, range) : ganttDayStart(date, range)}%`,
        }}
        aria-hidden="true"
      />
    ) : null;
  const toggle = (key: string) => {
    if (!groups.find((group) => group.key === key)?.children.length) return;
    setExpanded((previous) =>
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key],
    );
  };
  const period = (
    plan: MilestonePlan,
    kind: string,
    label: string,
    summary: boolean,
    open: () => void,
  ) => {
    if (!plan.startDate && !plan.dueDate) return null;
    const first = plan.startDate ?? plan.dueDate!,
      last = plan.dueDate ?? plan.startDate!;
    const segment = ganttSegment(first, last, range);
    if (!segment) return null;
    return (
      <button
        type="button"
        className={`vertical-period ${kind} ${summary ? "is-overview" : ""}`}
        style={{ top: segment.left, height: segment.width }}
        onClick={open}
        title={`${label}：${first}〜${last}`}
        aria-label={`${label}：${first}〜${last}`}
      />
    );
  };
  return (
    <div className="vertical-gantt">
      {visibleExpanded.length > 0 && (
        <div className="vertical-gantt-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => setExpanded([])}
          >
            作業を閉じる
          </button>
        </div>
      )}
      <div
        className="vertical-gantt-scroll"
        role="region"
        aria-label="日付を縦に並べた準備スケジュール"
        tabIndex={0}
      >
        <div
          className="vertical-gantt-grid"
          style={
            {
              "--column-count": columns.length,
              "--vertical-height": `${height}px`,
              "--vertical-day-height": `${100 / count}%`,
            } as CSSProperties
          }
        >
          <div className="vertical-gantt-header">
            <div className="vertical-gantt-corner">日付</div>
            {columns.map((column) => (
              <div
                key={column.key}
                className={`vertical-column-heading ${column.work ? "is-work" : "is-group-start"}`}
              >
                {column.work ? (
                  <button
                    type="button"
                    onClick={() => onEditWork(column.work!)}
                    className="vertical-heading-main"
                  >
                    <small>{column.parentTitle}の作業</small>
                    <strong>{column.title}</strong>
                    <small>編集する</small>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="vertical-heading-main"
                      aria-expanded={visibleExpanded.includes(column.key)}
                      disabled={!column.children.length}
                      onClick={() => toggle(column.key)}
                    >
                      <small>{column.milestone ? "◆ 到達点" : "未分類"}</small>
                      <strong>{column.title}</strong>
                      <span>
                        {column.children.length > 0 && (
                          <ChevronDown
                            size={14}
                            className={
                              visibleExpanded.includes(column.key)
                                ? "is-open"
                                : ""
                            }
                          />
                        )}
                        作業 {column.children.length}件
                      </span>
                    </button>
                    {column.milestone && (
                      <>
                        <small className="vertical-timing">
                          {scheduleTiming(column.milestone, today)}
                        </small>
                        <button
                          type="button"
                          className="text-button vertical-edit"
                          onClick={() => onEdit(column.milestone!)}
                          aria-label={`マイルストーン「${column.title}」を編集`}
                        >
                          到達点を編集
                        </button>
                      </>
                    )}
                  </>
                )}
                {column.work ? (
                  <ScheduleStatus
                    eventId={event.id}
                    target={{ kind: "work", item: column.work }}
                  />
                ) : column.milestone ? (
                  <ScheduleStatus
                    eventId={event.id}
                    target={{ kind: "milestone", item: column.milestone }}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="vertical-gantt-body">
            <div className="vertical-date-axis">
              {dates.map((date) => (
                <span
                  key={date}
                  className={`vertical-date-label ${date === today ? "is-today" : ""}`}
                  style={{
                    top: `${ganttDayStart(date, range)}%`,
                    height: `${100 / count}%`,
                  }}
                  title={date}
                >
                  <span>
                    {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                  </span>
                </span>
              ))}
              {line(event.date, "event")}
              {line(today, "today")}
            </div>
            {columns.map((column) => {
              const work = column.work;
              const overview = workOverview(column.allChildren, today);
              const planned = work ?? overview.planned;
              const open = () => (work ? onEditWork(work) : toggle(column.key));
              const due = work?.dueDate ?? column.milestone?.dueDate;
              const hasDates = planned.startDate || planned.dueDate || due;
              return (
                <div
                  key={column.key}
                  className={`vertical-gantt-column ${work ? "is-work" : "is-group-start"}`}
                >
                  {period(
                    planned,
                    "planned",
                    `${column.title}・${work ? "作業期間" : "作業全体の範囲"}`,
                    !work,
                    open,
                  )}
                  {!work && column.milestone && inRange(due) && (
                    <button
                      type="button"
                      className="vertical-milestone-marker"
                      style={{ top: `${ganttPosition(due!, range)}%` }}
                      onClick={() =>
                        work ? onEditWork(work) : onEdit(column.milestone!)
                      }
                      aria-label={`${column.title}・期限 ${due}・編集`}
                      title={`期限：${due}`}
                    >
                      ◆<span>期限</span>
                    </button>
                  )}
                  {!hasDates && (
                    <span className="vertical-unscheduled">日付未設定</span>
                  )}
                  {line(event.date, "event")}
                  {line(today, "today")}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
