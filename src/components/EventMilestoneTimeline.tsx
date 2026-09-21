import { useId, useState } from "react";
import { ChevronDown, Flag, Pencil } from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { dateLabel, localDate } from "../lib/dates";
import {
  scheduleTiming,
  sortedMilestones,
  unfinished,
} from "../lib/milestones";
import { workProgress } from "../lib/eventWork";
import { EventWorkList } from "./EventWorkList";
import { ScheduleStatus } from "./ScheduleStatus";
import { ScheduleOrder } from "./ScheduleOrder";

export function EventMilestoneTimeline({
  event,
  items,
  workItems,
  onEdit,
  onEditWork,
  onAddWork,
  onEditEvent,
}: {
  event: DanceEvent;
  items: EventMilestone[];
  workItems: EventWorkItem[];
  onEdit: (item: EventMilestone) => void;
  onEditWork: (item: EventWorkItem) => void;
  onAddWork: (milestoneId: string) => void;
  onEditEvent: () => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [hiddenCompleted, setHiddenCompleted] = useState<string[]>([]);
  const timelineId = useId();
  const unassigned = workItems.filter((work) => !work.milestoneId);
  const all = sortedMilestones(event.milestones ?? []);
  const numbers = new Map(all.map((item, index) => [item.id, index + 1]));
  const total = all.filter((item) => item.status !== "skipped").length;
  const achieved = all.filter((item) => item.status === "achieved").length;
  return (
    <ol
      className="preparation-timeline"
      aria-label={`${event.title}に向けたマイルストーン`}
    >
      {items.map((item, index) => {
        const number = numbers.get(item.id)!;
        const isHidden =
          item.status === "achieved" && hiddenCompleted.includes(item.id);
        const cardId = `${timelineId}-${item.id}`;
        const children = workItems.filter(
          (work) => work.milestoneId === item.id,
        );
        const progress = workProgress(
          (event.workItems ?? []).filter(
            (work) => work.milestoneId === item.id,
          ),
        );
        const isCollapsed = collapsed.includes(item.id);
        return (
          <li
            key={item.id}
            value={number}
            className={`preparation-timeline-step is-${item.status} ${isHidden ? "is-card-hidden" : ""}`}
          >
            {item.status === "achieved" ? (
              <button
                type="button"
                className="preparation-step-number preparation-number-toggle"
                aria-label={`マイルストーン${number}「${item.title}」を${isHidden ? "表示" : "非表示"}`}
                aria-expanded={!isHidden}
                aria-controls={cardId}
                title={
                  isHidden ? "クリックして再表示" : "クリックしてカードを非表示"
                }
                onClick={() =>
                  setHiddenCompleted((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  )
                }
              >
                <span>{number}</span>
              </button>
            ) : (
              <span className="preparation-step-number" aria-hidden="true">
                {number}
              </span>
            )}
            <article
              id={cardId}
              hidden={isHidden}
              className="preparation-step-card"
              aria-label={`マイルストーン「${item.title}」`}
            >
              <div className="preparation-step-header">
                <button
                  type="button"
                  className="preparation-step-title"
                  onClick={() => onEdit(item)}
                  aria-label={`${item.title}を編集`}
                >
                  <span className="preparation-step-label">
                    マイルストーン {number}
                  </span>
                  <h3>{item.title}</h3>
                  <span className="preparation-step-date">
                    期限：{item.dueDate?.replaceAll("-", "/") ?? "未設定"}
                  </span>
                </button>
                <div className="preparation-step-controls">
                  <ScheduleStatus
                    eventId={event.id}
                    target={{ kind: "milestone", item }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onEdit(item)}
                    aria-label={`${item.title}の詳細を編集`}
                    title="詳細を編集"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
              {item.successCriteria && (
                <p className="preparation-step-criteria">
                  {item.successCriteria}
                </p>
              )}
              <div className="preparation-step-meta">
                <small
                  className={
                    unfinished(item) &&
                    item.dueDate &&
                    item.dueDate < localDate()
                      ? "overdue"
                      : "muted"
                  }
                >
                  {scheduleTiming(item)}
                </small>
                <ScheduleOrder
                  eventId={event.id}
                  kind="milestone"
                  item={item}
                  previous={
                    index > 0 && items[index - 1].dueDate === item.dueDate
                      ? items[index - 1]
                      : undefined
                  }
                  next={
                    items[index + 1]?.dueDate === item.dueDate
                      ? items[index + 1]
                      : undefined
                  }
                />
              </div>
              <div className="preparation-work-toolbar">
                <span>
                  作業{" "}
                  <small>
                    {progress.completed} / {progress.total} 件完了
                  </small>
                </span>
                {children.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((current) =>
                        isCollapsed
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      )
                    }
                  >
                    <ChevronDown
                      size={14}
                      className={isCollapsed ? "is-closed" : ""}
                    />
                    {isCollapsed ? "作業を開く" : "作業をたたむ"}
                  </button>
                )}
              </div>
              <EventWorkList
                eventId={event.id}
                milestoneTitle={item.title}
                items={children}
                totalItems={(event.workItems ?? []).filter(
                  (work) => work.milestoneId === item.id,
                )}
                onEdit={onEditWork}
                onAdd={() => onAddWork(item.id)}
                compact
                collapsed={isCollapsed && children.length > 0}
              />
            </article>
          </li>
        );
      })}
      {unassigned.length > 0 && (
        <li className="preparation-timeline-step is-unassigned">
          <span className="preparation-step-number" aria-hidden="true">
            ・
          </span>
          <article className="preparation-step-card">
            <h3>未分類の作業</h3>
            <EventWorkList
              eventId={event.id}
              items={unassigned}
              totalItems={(event.workItems ?? []).filter(
                (work) => !work.milestoneId,
              )}
              onEdit={onEditWork}
              compact
            />
          </article>
        </li>
      )}
      <li className="preparation-timeline-step preparation-event-step">
        <span className="preparation-step-number" aria-hidden="true">
          <Flag size={16} />
        </span>
        <article className="preparation-step-card preparation-event-card">
          <span className="preparation-step-label">大会・イベント</span>
          <button
            type="button"
            className="preparation-event-title"
            onClick={onEditEvent}
          >
            {event.title}
          </button>
          <p>{dateLabel(event.date)}</p>
          {total > 0 && (
            <small>
              マイルストーン {achieved} / {total} 件達成
            </small>
          )}
        </article>
      </li>
    </ol>
  );
}
