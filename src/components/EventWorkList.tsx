import { Plus } from "lucide-react";
import type { EventWorkItem } from "../types";
import { workProgress, workSchedule, workStatuses } from "../lib/eventWork";
import { milestoneTiming } from "../lib/milestones";

export function EventWorkList({
  items,
  totalItems = items,
  onEdit,
  onAdd,
}: {
  items: EventWorkItem[];
  totalItems?: EventWorkItem[];
  onEdit: (item: EventWorkItem) => void;
  onAdd: () => void;
}) {
  const progress = workProgress(totalItems);
  return (
    <div className="milestone-task-children">
      {progress.total > 0 && (
        <details className="milestone-task-disclosure" open>
          <summary>
            作業 {progress.completed} / {progress.total} 件完了
          </summary>
          <ul className="milestone-task-list" role="list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="event-work-row"
                  onClick={() => onEdit(item)}
                >
                  <span className="event-work-row-heading">
                    <strong>{item.title}</strong>
                    <span className="tag">{workStatuses[item.status]}</span>
                  </span>
                  <small>
                    {item.startDate || item.dueDate
                      ? `${item.startDate ?? "開始未設定"} → ${item.dueDate ?? "期限未設定"}`
                      : "予定未設定"}
                  </small>
                  {item.description && (
                    <span className="clamp">{item.description}</span>
                  )}
                  <small>{milestoneTiming(workSchedule(item))}</small>
                </button>
              </li>
            ))}
            {!items.length && (
              <li className="muted">表示中の作業はありません。</li>
            )}
          </ul>
        </details>
      )}
      <button
        type="button"
        className="text-button milestone-task-edit"
        onClick={onAdd}
      >
        <Plus size={16} />
        作業を追加
      </button>
    </div>
  );
}
