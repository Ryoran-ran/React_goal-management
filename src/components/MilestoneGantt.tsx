import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { VerticalMilestoneGantt } from "./VerticalMilestoneGantt";
import { ScheduleStatus } from "./ScheduleStatus";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type {
  DanceEvent,
  EventMilestone,
  EventWorkItem,
  MilestonePlan,
} from "../types";
import { workOverview } from "../lib/verticalGantt";
import { workProgress, workSchedule } from "../lib/eventWork";
import { addDays, daysUntil, localDate } from "../lib/dates";
import { shiftCalendarMonth } from "../lib/calendar";
import {
  ganttPosition,
  ganttDayStart,
  plannedGanttRange,
  ganttSegment,
  scheduleTiming,
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
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
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
  const workRow = (
    work: EventWorkItem,
    groupEnd: boolean,
    parentTitle: string,
  ) => ({
    item: workSchedule(work),
    key: `work:${work.id}`,
    isWork: true,
    groupEnd,
    parentTitle,
    childCount: 0,
    summary: {} as MilestonePlan,
    statusTarget: { kind: "work" as const, item: work },
    open: () => onEditWork(work),
  });
  const rows = [
    ...items.flatMap((item) => {
      const children = workItems.filter((work) => work.milestoneId === item.id);
      const isCollapsed = collapsed.includes(item.id);
      return [
        {
          item,
          key: `milestone:${item.id}`,
          isWork: false,
          groupEnd: isCollapsed || children.length === 0,
          parentTitle: "",
          childCount: children.length,
          summary: workOverview(children, today).planned,
          statusTarget: { kind: "milestone" as const, item },
          open: () => onEdit(item),
        },
        ...(isCollapsed
          ? []
          : children.map((work, index) =>
              workRow(work, index === children.length - 1, item.title),
            )),
      ];
    }),
    ...workItems
      .filter((work) => !work.milestoneId)
      .map((work, index, array) =>
        workRow(work, index === array.length - 1, "未分類"),
      ),
  ];
  const scroller = useRef<HTMLDivElement>(null);
  const range = plannedGanttRange(event, scale, anchor);
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
        className={`gantt-bar ${kind}`}
        style={position}
        onClick={onOpen}
        title={`${label}：${first}〜${last}`}
        aria-label={`${item.title}、${label}：${first}〜${last}、編集する`}
      />
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
          表示設定
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
          </div>
          <h3>グラフの見方</h3>
          <div className="gantt-legend">
            <span>◆ マイルストーンの期限</span>
            <span className="planned">▬ 作業の予定期間</span>
            <span className="planned">薄いバー：配下の作業全体の期間</span>
            <span className="today">
              赤線：今日の{vertical ? "中央" : "左端"}
            </span>
            <span className="event">
              紫線：開催日の{vertical ? "上端" : "左端"}
            </span>
          </div>
          <p className="muted gantt-hint">
            {vertical
              ? "日付は縦、マイルストーンは横に並びます。列情報はページの上部に固定され、期限は◆で示します。開催日の紫線と今日の赤線は、それぞれ当日の中央を示します。縦方向はページを、横方向はチャート内をスクロールします。"
              : "マイルストーンと配下の作業を枠でまとめています。縦方向はページを、横方向はチャート内をスクロールします。矢印で作業を開閉し、項目名から編集できます。"}
          </p>
          <p className="muted gantt-hint">
            薄い帯は、完了分も含めた関連作業の全体範囲です。途中の空白期間も含みます。
          </p>
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
            {rows.map(
              ({
                item,
                key,
                isWork,
                open,
                statusTarget,
                groupEnd,
                parentTitle,
                childCount,
                summary,
              }) => (
                <div
                  className={`gantt-grid-row ${isWork ? "gantt-work-row" : "gantt-milestone-row"} ${groupEnd ? "gantt-group-end" : ""} ${item.status === "skipped" ? "is-skipped" : ""}`}
                  key={key}
                >
                  <div className="gantt-label">
                    {!isWork && childCount > 0 && (
                      <button
                        type="button"
                        className="text-button gantt-group-toggle"
                        aria-expanded={!collapsed.includes(item.id)}
                        aria-label={`${item.title}の作業を${collapsed.includes(item.id) ? "開く" : "たたむ"}`}
                        onClick={() =>
                          setCollapsed((current) =>
                            current.includes(item.id)
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                      >
                        <ChevronDown
                          size={14}
                          className={
                            collapsed.includes(item.id) ? "is-closed" : ""
                          }
                        />
                        作業 {childCount}件
                      </button>
                    )}
                    <button
                      type="button"
                      className="gantt-item-edit"
                      onClick={open}
                      title={item.title}
                    >
                      <strong>
                        {isWork ? "↳ " : "◆ "}
                        {item.title}
                      </strong>
                      {isWork && (
                        <small className="gantt-parent-name">
                          {parentTitle}の作業
                        </small>
                      )}
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
                        {isWork && item.status === "achieved"
                          ? "完了"
                          : scheduleTiming(item, today)}
                      </small>
                    </button>
                    <ScheduleStatus eventId={event.id} target={statusTarget} />
                  </div>
                  <div className="gantt-track">
                    {line(event.date, "event")}
                    {line(today, "today")}
                    {!isWork &&
                      bar(
                        item,
                        summary.startDate,
                        summary.dueDate,
                        "planned is-overview",
                        "作業全体の予定",
                        open,
                      )}
                    {isWork &&
                      bar(
                        item,
                        item.startDate ?? item.dueDate,
                        item.dueDate ?? item.startDate,
                        "planned",
                        "予定",
                        open,
                      )}
                    {!isWork && inRange(item.dueDate) && (
                      <button
                        type="button"
                        className="gantt-deadline"
                        style={{
                          left: `${ganttPosition(item.dueDate!, range)}%`,
                        }}
                        onClick={open}
                        aria-label={`${item.title}の期限 ${item.dueDate}・編集`}
                        title={`期限：${item.dueDate}`}
                      >
                        ◆
                      </button>
                    )}
                    {!item.dueDate &&
                      (!isWork || !item.startDate) &&
                      !summary.startDate &&
                      !summary.dueDate && (
                        <span className="gantt-unscheduled">日付未設定</span>
                      )}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
