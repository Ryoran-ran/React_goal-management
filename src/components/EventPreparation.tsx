import { useState } from "react";
import { ArrowLeft, Plus, Pencil, ChevronRight, Flag } from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { base } from "../data/repository";
import { dateLabel, localDate } from "../lib/dates";
import {
  milestoneTiming,
  sortedMilestones,
  unfinished,
  milestonePlanDelay,
  type GanttScale,
} from "../lib/milestones";
import { MilestoneEditor } from "./MilestoneEditor";
import { MilestoneGantt } from "./MilestoneGantt";
import { EventWorkList } from "./EventWorkList";
import { EventWorkEditor } from "./EventWorkEditor";
import { ScheduleStatus } from "./ScheduleStatus";

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
  const [editingWork, setEditingWork] = useState<EventWorkItem>();
  const all = sortedMilestones(event.milestones ?? []);
  const allWork = event.workItems ?? [];
  const visibleWork = allWork.filter(
    (item) => showFinished || item.status !== "completed",
  );
  const items = all.filter(
    (item) =>
      showFinished ||
      unfinished(item) ||
      visibleWork.some((work) => work.milestoneId === item.id),
  );
  const unassigned = visibleWork.filter((item) => !item.milestoneId);
  const openWork = (item: EventWorkItem) => {
    setEditingWork(item);
    window.scrollTo({ top: 0 });
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
          window.scrollTo({ top: 0 });
        }}
        onNext={addWork}
      />
    );
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
        {(view !== "gantt" || (!items.length && !unassigned.length)) && (
          <div className="milestone-summary">
            <label>
              <input
                type="checkbox"
                checked={showFinished}
                onChange={(e) => setShowFinished(e.target.checked)}
              />
              達成・完了・見送りも表示
            </label>
          </div>
        )}
        {!all.length && !allWork.length ? (
          <p className="empty">大会までに準備したい到達点を追加しましょう。</p>
        ) : !items.length && !unassigned.length ? (
          <p className="empty">
            未達成のマイルストーン・未完了の作業はありません。
          </p>
        ) : view === "gantt" ? (
          <MilestoneGantt
            event={event}
            items={items}
            onEdit={open}
            workItems={visibleWork}
            onEditWork={openWork}
            scale={scale}
            onScale={setScale}
            anchor={anchor}
            onAnchor={setAnchor}
            showFinished={showFinished}
            onShowFinished={setShowFinished}
          />
        ) : (
          <ul className="milestone-tree" role="list">
            <li>
              <details className="milestone-tree-event" open>
                <summary>
                  <ChevronRight
                    className="milestone-tree-toggle"
                    size={18}
                    aria-hidden="true"
                  />
                  <Flag size={18} aria-hidden="true" />
                  <span className="milestone-tree-event-name">
                    {event.title}
                  </span>
                  <span className="milestone-tree-count">
                    節目 {items.length} · 作業 {visibleWork.length}
                  </span>
                </summary>
                <ul
                  className="milestone-list"
                  role="list"
                  aria-label={`${event.title}のマイルストーン`}
                >
                  {items.map((item) => (
                    <li className="milestone-branch" key={item.id}>
                      <article
                        className="milestone-work-group"
                        aria-label={`マイルストーン「${item.title}」とその作業`}
                      >
                        <button
                          type="button"
                          className="milestone-list-row"
                          onClick={() => open(item)}
                          aria-label={`マイルストーン「${item.title}」を編集`}
                        >
                          <span className="milestone-dot" aria-hidden="true">
                            {item.status === "achieved" ? "✓" : "◆"}
                          </span>
                          <div>
                            <span className="milestone-role-label">
                              マイルストーン · 到達点
                            </span>
                            <strong>{item.title}</strong>
                            <p>
                              期限：
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
                        </button>
                        <div className="milestone-status-row">
                          <ScheduleStatus
                            eventId={event.id}
                            target={{ kind: "milestone", item }}
                          />
                        </div>
                        <EventWorkList
                          eventId={event.id}
                          milestoneTitle={item.title}
                          items={visibleWork.filter(
                            (work) => work.milestoneId === item.id,
                          )}
                          totalItems={allWork.filter(
                            (work) => work.milestoneId === item.id,
                          )}
                          onEdit={openWork}
                          onAdd={() => addWork(item.id)}
                        />
                      </article>
                    </li>
                  ))}
                  {allWork.some((work) => !work.milestoneId) && (
                    <li className="milestone-branch">
                      <article
                        className="milestone-work-group is-unassigned"
                        aria-label="マイルストーン未設定の作業"
                      >
                        <h3 className="unassigned-work-heading">
                          未分類の作業
                        </h3>
                        <EventWorkList
                          eventId={event.id}
                          items={unassigned}
                          totalItems={allWork.filter(
                            (work) => !work.milestoneId,
                          )}
                          onEdit={openWork}
                        />
                      </article>
                    </li>
                  )}
                </ul>
              </details>
            </li>
          </ul>
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
