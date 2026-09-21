import { useState } from "react";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import type { DanceEvent, EventMilestone } from "../types";
import { base } from "../data/repository";
import { dateLabel, localDate } from "../lib/dates";
import {
  milestoneStatuses,
  milestoneTiming,
  sortedMilestones,
  unfinished,
  milestonePlanDelay,
  type GanttScale,
} from "../lib/milestones";
import { MilestoneEditor } from "./MilestoneEditor";
import { MilestoneGantt } from "./MilestoneGantt";

export function EventPreparation({
  event,
  onBack,
  onEditEvent,
}: {
  event: DanceEvent;
  onBack: () => void;
  onEditEvent: () => void;
}) {
  const [view, setView] = useState("list");
  const [scale, setScale] = useState<GanttScale>("event");
  const [anchor, setAnchor] = useState(localDate);
  const [showFinished, setShowFinished] = useState(false);
  const [editing, setEditing] = useState<EventMilestone>();
  const all = sortedMilestones(event.milestones ?? []);
  const items = all.filter((item) => showFinished || unfinished(item));
  const open = (item: EventMilestone) => {
    setEditing(item);
    window.scrollTo({ top: 0 });
  };
  if (editing)
    return (
      <MilestoneEditor
        event={event}
        value={editing}
        onClose={() => {
          setEditing(undefined);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  return (
    <section className="event-preparation">
      <button
        type="button"
        className="text-button agenda-back"
        onClick={onBack}
      >
        <ArrowLeft size={18} />
        イベント一覧に戻る
      </button>
      <div className="event-preparation-heading">
        <div>
          <h1>{event.title}</h1>
          <p>{dateLabel(event.date)}</p>
        </div>
        <button type="button" className="text-button" onClick={onEditEvent}>
          <Pencil size={16} />
          イベントを編集
        </button>
      </div>
      <section className="card preparation-card">
        <div className="section-heading">
          <h2>準備スケジュール</h2>
          <div
            className="segmented"
            role="group"
            aria-label="準備スケジュールの表示"
          >
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              一覧
            </button>
            <button
              type="button"
              className={view === "gantt" ? "active" : ""}
              aria-pressed={view === "gantt"}
              onClick={() => setView("gantt")}
            >
              ガント
            </button>
          </div>
        </div>
        <div className="milestone-summary">
          <span>
            {all.filter((item) => item.status === "achieved").length} /{" "}
            {all.filter((item) => item.status !== "skipped").length} 件達成
          </span>
          <label>
            <input
              type="checkbox"
              checked={showFinished}
              onChange={(e) => setShowFinished(e.target.checked)}
            />
            達成・見送りも表示
          </label>
        </div>
        {!all.length ? (
          <p className="empty">大会までに準備したい到達点を追加しましょう。</p>
        ) : !items.length ? (
          <p className="empty">未達成のマイルストーンはありません。</p>
        ) : view === "gantt" ? (
          <MilestoneGantt
            event={event}
            items={items}
            onEdit={open}
            scale={scale}
            onScale={setScale}
            anchor={anchor}
            onAnchor={setAnchor}
          />
        ) : (
          <div className="milestone-list">
            {items.map((item) => (
              <button
                type="button"
                className="milestone-list-row"
                key={item.id}
                onClick={() => open(item)}
              >
                <span className="milestone-dot" aria-hidden="true">
                  {item.status === "achieved" ? "✓" : "◆"}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.startDate
                      ? `${item.startDate.replaceAll("-", "/")}〜`
                      : "期限："}
                    {item.dueDate?.replaceAll("-", "/") ?? "未設定"}
                  </p>
                  {item.successCriteria && (
                    <p className="clamp">{item.successCriteria}</p>
                  )}
                  <small
                    className={
                      unfinished(item) &&
                      item.dueDate &&
                      item.dueDate < localDate()
                        ? "overdue"
                        : ""
                    }
                  >
                    {milestoneTiming(item)}
                  </small>
                  {milestonePlanDelay(item) > 0 && (
                    <small className="overdue">
                      {" "}
                      · 当初より{milestonePlanDelay(item)}日後ろ
                    </small>
                  )}
                </div>
                <span className="tag">{milestoneStatuses[item.status]}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="secondary milestone-add"
          onClick={() =>
            open({
              ...base(),
              title: "",
              successCriteria: "",
              status: "not_started",
              changes: [],
            })
          }
        >
          <Plus size={18} />
          マイルストーンを追加
        </button>
      </section>
    </section>
  );
}
