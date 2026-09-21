import { useEffect, useRef, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DanceEvent, EventMilestone } from "../types";
import { addDays, daysUntil, localDate } from "../lib/dates";
import { shiftCalendarMonth } from "../lib/calendar";
import {
  ganttPosition,
  ganttRange,
  ganttSegment,
  milestoneStatuses,
  milestoneTiming,
  milestonePlanDelay,
  type GanttScale,
} from "../lib/milestones";

export function MilestoneGantt({
  event,
  items,
  onEdit,
  scale,
  onScale,
  anchor,
  onAnchor,
}: {
  event: DanceEvent;
  items: EventMilestone[];
  onEdit: (item: EventMilestone) => void;
  scale: GanttScale;
  onScale: (scale: GanttScale) => void;
  anchor: string;
  onAnchor: (date: string) => void;
}) {
  const today = localDate();
  const scroller = useRef<HTMLDivElement>(null);
  const range = ganttRange(event, scale, anchor);
  const count = daysUntil(range.end, range.start) + 1;
  const width = Math.max(
    420,
    Math.min(
      1600,
      count * (scale === "week" ? 56 : scale === "month" ? 26 : 18),
    ),
  );
  const stride = Math.max(1, Math.ceil(count / (scale === "week" ? 7 : 18)));
  useEffect(() => {
    if (!scroller.current) return;
    const offset =
      today >= range.start && today <= range.end
        ? (ganttPosition(today, range) / 100) * width
        : 0;
    scroller.current.scrollLeft = Math.max(0, offset - 70);
  }, [range.start, range.end, width, today]);
  const ticks = Array.from({ length: Math.ceil(count / stride) }, (_, i) =>
    addDays(range.start, i * stride),
  );
  const inRange = (date?: string) =>
    !!date && date >= range.start && date <= range.end;
  const line = (date: string, className: string) =>
    inRange(date) ? (
      <span
        className={`gantt-marker-line ${className}`}
        style={{ left: `${ganttPosition(date, range)}%` }}
        aria-hidden="true"
      />
    ) : null;
  const move = (amount: number) =>
    onAnchor(
      scale === "week"
        ? addDays(anchor, amount * 7)
        : `${shiftCalendarMonth(anchor.slice(0, 7), amount)}-01`,
    );
  const bar = (
    item: EventMilestone,
    start: string | undefined,
    end: string | undefined,
    kind: string,
    label: string,
  ) => {
    if (!end && !start) return null;
    const first = start ?? end!,
      last = end ?? start!;
    const position = ganttSegment(first, last, range);
    if (!position) return null;
    return (
      <button
        type="button"
        className={`gantt-bar ${kind} ${!start || !end ? "is-point" : ""}`}
        style={
          !start || !end
            ? {
                left: `${ganttPosition(first, range)}%`,
                width: 20,
                transform: "translateX(-50%)",
              }
            : position
        }
        onClick={() => onEdit(item)}
        title={`${label}：${first}〜${last}`}
        aria-label={`${item.title}、${label}：${first}〜${last}、編集する`}
      >
        {!start || !end ? "◆" : <span>{label}</span>}
      </button>
    );
  };
  return (
    <div className="milestone-gantt">
      <div className="gantt-controls">
        <label>
          表示期間
          <select
            value={scale}
            onChange={(e) => onScale(e.target.value as GanttScale)}
          >
            <option value="week">週</option>
            <option value="month">月</option>
            <option value="event">全期間</option>
          </select>
        </label>
        {scale !== "event" && (
          <div className="gantt-navigation">
            <button
              type="button"
              className="icon-button"
              aria-label="前の期間"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onAnchor(today)}
            >
              今日
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="次の期間"
              onClick={() => move(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      <p className="gantt-range" aria-live="polite">
        {range.start.replaceAll("-", "/")}〜{range.end.replaceAll("-", "/")}
      </p>
      <div className="gantt-legend">
        <span className="baseline">当初計画</span>
        <span className="planned">現在の計画</span>
        <span className="actual">実績（開始〜達成）</span>
        <span>◆ 期限・達成日</span>
        <span className="today">赤線：今日</span>
        <span className="event">紫線：開催日</span>
      </div>
      <p className="muted gantt-hint">
        日付部分は横にスクロールできます。項目名から編集できます。
      </p>
      <div
        className="gantt-scroll"
        ref={scroller}
        role="region"
        aria-label="準備スケジュールのガントチャート"
        tabIndex={0}
      >
        <div
          className="gantt-grid"
          style={{ "--timeline-width": `${width}px` } as CSSProperties}
        >
          <div className="gantt-grid-header">
            <div className="gantt-label">到達点</div>
            <div className="gantt-track">
              {ticks.map((date) => (
                <span
                  key={date}
                  className="gantt-tick"
                  style={{ left: `${ganttPosition(date, range)}%` }}
                >
                  {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                </span>
              ))}
              {line(event.date, "event")}
              {line(today, "today")}
            </div>
          </div>
          {items.map((item) => (
            <div
              className={`gantt-grid-row ${item.status === "skipped" ? "is-skipped" : ""}`}
              key={item.id}
            >
              <button
                type="button"
                className="gantt-label"
                onClick={() => onEdit(item)}
                title={item.title}
              >
                <strong>{item.title}</strong>
                <small>{milestoneStatuses[item.status]}</small>
                {milestonePlanDelay(item) > 0 && (
                  <small className="overdue">
                    当初より{milestonePlanDelay(item)}日後ろ
                  </small>
                )}
                <small
                  className={
                    item.dueDate &&
                    item.dueDate < today &&
                    item.status !== "achieved" &&
                    item.status !== "skipped"
                      ? "overdue"
                      : ""
                  }
                >
                  {milestoneTiming(item, today)}
                </small>
              </button>
              <div className="gantt-track">
                {ticks.map((date) => (
                  <span
                    key={date}
                    className="gantt-grid-line"
                    style={{ left: `${ganttPosition(date, range)}%` }}
                  />
                ))}
                {line(event.date, "event")}
                {line(today, "today")}
                {bar(
                  item,
                  item.baseline?.startDate,
                  item.baseline?.dueDate,
                  "baseline",
                  "当初",
                )}
                {bar(item, item.startDate, item.dueDate, "planned", "計画")}
                {bar(
                  item,
                  item.actualStartDate,
                  item.completedDate ??
                    (item.status === "in_progress" && item.actualStartDate
                      ? today
                      : undefined),
                  "actual",
                  item.completedDate
                    ? "達成"
                    : item.status === "in_progress"
                      ? "実施中"
                      : "開始",
                )}
                {inRange(item.dueDate) && (
                  <span
                    className="gantt-diamond planned"
                    style={{ left: `${ganttPosition(item.dueDate!, range)}%` }}
                    aria-hidden="true"
                  >
                    ◆
                  </span>
                )}
                {inRange(item.completedDate) && (
                  <span
                    className="gantt-diamond actual"
                    style={{
                      left: `${ganttPosition(item.completedDate!, range)}%`,
                    }}
                    aria-hidden="true"
                  >
                    ◆
                  </span>
                )}
                {!item.startDate &&
                  !item.dueDate &&
                  !item.actualStartDate &&
                  !item.completedDate && (
                    <span className="gantt-unscheduled">日付未設定</span>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
