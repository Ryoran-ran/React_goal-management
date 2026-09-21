import { Plus } from "lucide-react";
import type { EventWorkItem } from "../types";
import { workProgress, workSchedule } from "../lib/eventWork";
import { ScheduleStatus } from "./ScheduleStatus";
import { ScheduleOrder } from "./ScheduleOrder";
import { milestoneTiming } from "../lib/milestones";

export function EventWorkList({
  items,
  totalItems = items,
  milestoneTitle,
  onEdit,
  onAdd,
  eventId,
  compact = false,
  collapsed = false,
}: {
  items: EventWorkItem[];
  totalItems?: EventWorkItem[];
  milestoneTitle?: string;
  onEdit: (item: EventWorkItem) => void;
  onAdd?: () => void;
  eventId: string;
  compact?: boolean;
  collapsed?: boolean;
}) {
  const progress = workProgress(totalItems);
  return (
    <div className={`milestone-task-children ${compact ? "is-compact" : ""}`}>
      <div className="milestone-task-disclosure">
        {!compact && (
          <div className="work-tree-caption">
            <span>{milestoneTitle ? "作業" : "到達点が未設定の作業"}</span>
            <span className="work-completion-count">
              {progress.completed} / {progress.total} 件完了
            </span>
          </div>
        )}
        {!collapsed &&
          (items.length > 0 ? (
            <ul
              className="milestone-task-list"
              role="list"
              aria-label={
                milestoneTitle
                  ? `「${milestoneTitle}」に向けた作業`
                  : "未分類の作業"
              }
            >
              {items.map((item, index) => (
                <li key={item.id} className="work-list-entry">
                  <button
                    type="button"
                    className="event-work-row"
                    onClick={() => onEdit(item)}
                  >
                    <span className="event-work-row-heading">
                      <strong>{item.title}</strong>
                    </span>
                    <small>
                      {item.startDate || item.dueDate
                        ? `${item.startDate ?? "開始未設定"} → ${item.dueDate ?? item.startDate ?? "終了未設定"}`
                        : "予定未設定"}
                    </small>
                    {item.description && (
                      <span className="clamp">{item.description}</span>
                    )}
                    <small>{milestoneTiming(workSchedule(item))}</small>
                  </button>
                  <div className="work-tree-actions">
                    <ScheduleStatus
                      eventId={eventId}
                      target={{ kind: "work", item }}
                    />
                    <ScheduleOrder
                      eventId={eventId}
                      kind="work"
                      item={item}
                      previous={
                        index > 0 &&
                        items[index - 1].startDate === item.startDate
                          ? items[index - 1]
                          : undefined
                      }
                      next={
                        items[index + 1]?.startDate === item.startDate
                          ? items[index + 1]
                          : undefined
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="work-group-empty">
              {progress.total
                ? "登録した作業はすべて完了しています。"
                : milestoneTitle
                  ? "この到達点に向けた作業は、まだ登録されていません。"
                  : "表示する作業はありません。"}
            </p>
          ))}
        {onAdd && milestoneTitle && (
          <button
            type="button"
            className="secondary milestone-task-edit"
            onClick={onAdd}
            aria-label={`マイルストーン「${milestoneTitle}」に作業を追加`}
          >
            <Plus size={16} />
            <span>
              {compact ? "作業を追加" : "このマイルストーンに作業を追加"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
