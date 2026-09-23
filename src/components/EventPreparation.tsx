import { useState } from "react";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { base } from "../data/repository";
import { dateLabel, localDate } from "../lib/dates";
import { sortedMilestones, type GanttScale } from "../lib/milestones";
import { MilestoneEditor } from "./MilestoneEditor";
import { MilestoneGantt } from "./MilestoneGantt";
import { EventMilestoneTimeline } from "./EventMilestoneTimeline";
import { EventWorkEditor } from "./EventWorkEditor";
import { sortedEventWork } from "../lib/eventWork";
import { scrollPageToTop } from "../lib/pageScroll";

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
  const [editing, setEditing] = useState<EventMilestone>();
  const [editingWork, setEditingWork] = useState<EventWorkItem>();
  const all = sortedMilestones(event.milestones ?? []);
  const allWork = sortedEventWork(event.workItems ?? []);
  const openWork = (item: EventWorkItem) => {
    setEditingWork(item);
    scrollPageToTop();
  };
  const addWork = (milestoneId: string) =>
    openWork({
      ...base(),
      milestoneId,
      title: "",
      description: "",
      priority: "medium",
      status: "not_started",
      changes: [],
    });
  if (editingWork)
    return (
      <EventWorkEditor
        key={editingWork.id}
        event={event}
        value={editingWork}
        onClose={() => {
          setEditingWork(undefined);
          scrollPageToTop();
        }}
        onNext={addWork}
      />
    );
  const open = (item: EventMilestone) => {
    setEditing(item);
    scrollPageToTop();
  };
  if (editing)
    return (
      <MilestoneEditor
        event={event}
        value={editing}
        onClose={() => {
          setEditing(undefined);
          scrollPageToTop();
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
          <div>
            <h2>準備スケジュール</h2>
            <p className="preparation-progress">
              {all.filter((item) => item.status === "achieved").length} /{" "}
              {all.filter((item) => item.status !== "skipped").length} 件達成
            </p>
          </div>
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
        {!all.length && !allWork.length ? (
          <p className="empty">大会までに準備したい到達点を追加しましょう。</p>
        ) : view === "gantt" ? (
          <MilestoneGantt
            event={event}
            items={all}
            onEdit={open}
            workItems={allWork}
            onEditWork={openWork}
            scale={scale}
            onScale={setScale}
            anchor={anchor}
            onAnchor={setAnchor}
          />
        ) : (
          <EventMilestoneTimeline
            event={event}
            items={all}
            workItems={allWork}
            onEdit={open}
            onEditWork={openWork}
            onAddWork={addWork}
            onEditEvent={onEditEvent}
          />
        )}
        <div className="preparation-add-actions">
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
        </div>
      </section>
    </section>
  );
}
