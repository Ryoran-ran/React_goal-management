import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { VerticalMilestoneGantt } from "./VerticalMilestoneGantt";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { workProgress, workSchedule } from "../lib/eventWork";
import { addDays, daysUntil, localDate } from "../lib/dates";
import { shiftCalendarMonth } from "../lib/calendar";
import {
  ganttPosition,
  ganttDayStart,
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
  workItems,
  onEditWork,
  scale,
  onScale,
  anchor,
  onAnchor,
  showFinished,
  onShowFinished,
}: {
  event: DanceEvent;
  items: EventMilestone[];
  onEdit: (item: EventMilestone) => void;
  workItems: EventWorkItem[];
  onEditWork: (item: EventWorkItem) => void;
  scale: GanttScale;
  onScale: (scale: GanttScale) => void;
  anchor: string;
  onAnchor: (date: string) => void;
  showFinished: boolean;
  onShowFinished: (value: boolean) => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsId = useId();
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [direction, setDirection] = useState<"vertical" | "horizontal">();
  const vertical =
    (direction ?? (mobile ? "vertical" : "horizontal")) === "vertical";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const today = localDate();
  const workRow = (work: EventWorkItem) => ({
    item: workSchedule(work),
    key: `work:${work.id}`,
    isWork: true,
    open: () => onEditWork(work),
  });
  const rows = [
    ...items.flatMap((item) => [
      {
        item,
        key: `milestone:${item.id}`,
        isWork: false,
        open: () => onEdit(item),
      },
      ...workItems.filter((work) => work.milestoneId === item.id).map(workRow),
    ]),
    ...workItems.filter((work) => !work.milestoneId).map(workRow),
  ];
  const scroller = useRef<HTMLDivElement>(null);
  const range = ganttRange(event, scale, anchor);
  const count = daysUntil(range.end, range.start) + 1;
  const width = Math.max(
    420,
    Math.min(
      1600,
      count * (scale === "week" ? 56 : scale === "month" ? 40 : 32),
    ),
  );
  const stride = Math.max(1, Math.ceil(count / Math.floor(width / 32)));
  useEffect(() => {
    if (!scroller.current) return;
    const offset =
      today >= range.start && today <= range.end
        ? (ganttPosition(today, range) / 100) * width
        : 0;
    scroller.current.scrollLeft = Math.max(0, offset - 70);
  }, [range.start, range.end, width, today, vertical]);
  const ticks = Array.from({ length: Math.ceil(count / stride) }, (_, i) =>
    addDays(range.start, i * stride),
  );
  const inRange = (date?: string) =>
    !!date && date >= range.start && date <= range.end;
  const line = (date: string, className: string) =>
    inRange(date) ? (
      <span
        className={`gantt-marker-line ${className}`}
        style={{ left: `${ganttDayStart(date, range)}%` }}
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
    onOpen: () => void,
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
        onClick={onOpen}
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
        <div className="segmented" role="group" aria-label="ガントの表示期間">
          {(
            [
              ["event", "全期間"],
              ["month", "月"],
              ["week", "週"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={scale === value ? "active" : ""}
              aria-pressed={scale === value}
              onClick={() => onScale(value)}
            >
              {label}
            </button>
          ))}
        </div>
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
      <div className="gantt-options-row">
        <p className="gantt-range" aria-live="polite">
          {scale === "month"
            ? `${range.start.slice(0, 4)}年${Number(range.start.slice(5, 7))}月`
            : `${range.start.replaceAll("-", "/")}〜${range.end.replaceAll("-", "/")}`}
        </p>
        <button
          type="button"
          className="text-button gantt-options-toggle"
          aria-expanded={optionsOpen}
          aria-controls={optionsId}
          onClick={() => setOptionsOpen(!optionsOpen)}
        >
          表示設定{showFinished ? "・完了を含む" : ""}
          {optionsOpen ? " ▴" : " ▾"}
        </button>
        <div
          id={optionsId}
          className="gantt-options-panel"
          hidden={!optionsOpen}
        >
          <div className="gantt-controls">
            <label>
              表示方向
              <select
                value={vertical ? "vertical" : "horizontal"}
                onChange={(e) =>
                  setDirection(e.target.value as "vertical" | "horizontal")
                }
              >
                <option value="vertical">縦</option>
                <option value="horizontal">横</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={showFinished}
                onChange={(e) => onShowFinished(e.target.checked)}
              />
              達成・完了・見送りも表示
            </label>
          </div>
          <h3>グラフの見方</h3>
          <div className="gantt-legend">
            <span className="baseline">当初計画</span>
            <span className="planned">現在の計画</span>
            <span className="actual">実績（開始〜達成）</span>
            <span>◆ 到達点・期限　━ 作業期間</span>
            <span className="today">
              赤線：今日の{vertical ? "中央" : "左端"}
            </span>
            <span className="event">
              紫線：開催日の{vertical ? "上端" : "左端"}
            </span>
          </div>
          <p className="muted gantt-hint">
            {vertical
              ? "日付は縦、マイルストーンは横に並びます。見出しをタップすると関連作業を展開できます。上下・左右にスクロールできます。"
              : "日付部分は横にスクロールできます。項目名から編集できます。"}
          </p>
          {vertical && (
            <p className="muted gantt-hint">
              薄い帯は、完了分も含めた関連作業の全体範囲です。途中の空白期間も含みます。
            </p>
          )}
        </div>
      </div>
      {vertical ? (
        <VerticalMilestoneGantt
          event={event}
          items={items}
          workItems={workItems}
          range={range}
          scale={scale}
          onEdit={onEdit}
          onEditWork={onEditWork}
        />
      ) : (
        <div
          className="gantt-scroll"
          ref={scroller}
          role="region"
          aria-label="準備スケジュールのガントチャート"
          tabIndex={0}
        >
          <div
            className="gantt-grid"
            style={
              {
                "--timeline-width": `${width}px`,
                "--day-width": `${100 / count}%`,
              } as CSSProperties
            }
          >
            <div className="gantt-grid-header">
              <div className="gantt-label">到達点</div>
              <div className="gantt-track">
                {ticks.map((date) => (
                  <span
                    key={date}
                    className="gantt-tick"
                    style={{
                      left: `${ganttDayStart(date, range)}%`,
                      width: `${100 / count}%`,
                    }}
                    title={date}
                  >
                    {scale === "week" ||
                    date === range.start ||
                    date.endsWith("-01")
                      ? `${Number(date.slice(5, 7))}/`
                      : ""}
                    {Number(date.slice(8))}
                  </span>
                ))}
                {line(event.date, "event")}
                {line(today, "today")}
              </div>
            </div>
            {rows.map(({ item, key, isWork, open }) => (
              <div
                className={`gantt-grid-row ${isWork ? "gantt-work-row" : "gantt-milestone-row"} ${item.status === "skipped" ? "is-skipped" : ""}`}
                key={key}
              >
                <button
                  type="button"
                  className="gantt-label"
                  onClick={open}
                  title={item.title}
                >
                  <strong>
                    {isWork ? "作業：" : "◆ "}
                    {item.title}
                  </strong>
                  <small>{milestoneStatuses[item.status]}</small>
                  {!isWork &&
                    workProgress(
                      (event.workItems ?? []).filter(
                        (work) => work.milestoneId === item.id,
                      ),
                    ).total > 0 && (
                      <small>
                        作業{" "}
                        {
                          workProgress(
                            (event.workItems ?? []).filter(
                              (work) => work.milestoneId === item.id,
                            ),
                          ).completed
                        }{" "}
                        /{" "}
                        {
                          workProgress(
                            (event.workItems ?? []).filter(
                              (work) => work.milestoneId === item.id,
                            ),
                          ).total
                        }{" "}
                        完了
                      </small>
                    )}
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
                  {line(event.date, "event")}
                  {line(today, "today")}
                  {bar(
                    item,
                    isWork ? item.baseline?.startDate : undefined,
                    item.baseline?.dueDate,
                    "baseline",
                    "当初",
                    open,
                  )}
                  {bar(
                    item,
                    isWork ? item.startDate : undefined,
                    item.dueDate,
                    "planned",
                    "計画",
                    open,
                  )}
                  {bar(
                    item,
                    isWork ? item.actualStartDate : undefined,
                    item.completedDate ??
                      (isWork &&
                      item.status === "in_progress" &&
                      item.actualStartDate
                        ? today
                        : undefined),
                    "actual",
                    item.completedDate
                      ? "達成"
                      : item.status === "in_progress"
                        ? "実施中"
                        : "開始",
                    open,
                  )}
                  {inRange(item.dueDate) && (
                    <span
                      className="gantt-diamond planned"
                      style={{
                        left: `${ganttPosition(item.dueDate!, range)}%`,
                      }}
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
                  {(!isWork || !item.startDate) &&
                    !item.dueDate &&
                    (!isWork || !item.actualStartDate) &&
                    !item.completedDate && (
                      <span className="gantt-unscheduled">日付未設定</span>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
