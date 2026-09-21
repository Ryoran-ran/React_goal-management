import { Plus } from "lucide-react";
import type { EventWorkItem } from "../types";
import { workProgress, workSchedule, workStatuses } from "../lib/eventWork";
import { milestoneTiming } from "../lib/milestones";

export function EventWorkList({
  items,
  totalItems = items,
  milestoneTitle,
  onEdit,
  onAdd,
}: {
  items: EventWorkItem[];
  totalItems?: EventWorkItem[];
  milestoneTitle?: string;
  onEdit: (item: EventWorkItem) => void;
  onAdd?: () => void;
}) {
  const progress = workProgress(totalItems);
  return (
    <div className="milestone-task-children">
      <details className="milestone-task-disclosure" open>
        <summary>
          <span>
            {milestoneTitle ? "この到達点に向けた作業" : "到達点が未設定の作業"}
          </span>
          <span className="work-completion-count">
            {progress.completed} / {progress.total} 件完了
          </span>
        </summary>
        {items.length > 0 ? (
          <ul
            className="milestone-task-list"
            role="list"
            aria-label={
              milestoneTitle
                ? `「${milestoneTitle}」に向けた作業`
                : "未分類の作業"
            }
          >
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
          </ul>
        ) : (
          <p className="work-group-empty">
            {progress.total
              ? "登録した作業はすべて完了しています。"
              : milestoneTitle
                ? "この到達点に向けた作業は、まだ登録されていません。"
                : "表示する作業はありません。"}
          </p>
        )}
        {onAdd && milestoneTitle && (
          <button
            type="button"
            className="secondary milestone-task-edit"
            onClick={onAdd}
            aria-label={`マイルストーン「${milestoneTitle}」に作業を追加`}
          >
            <Plus size={16} />
            <span>このマイルストーンに作業を追加</span>
          </button>
        )}
      </details>
    </div>
  );
}
