import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventMilestone, MilestoneTask } from "../types";
import { milestoneTaskProgress } from "../lib/milestones";
import { setMilestoneTaskCompleted } from "../data/eventMilestones";
import { errorText } from "../lib/hooks";

export function MilestoneTasksEditor({
  tasks,
  onChange,
}: {
  tasks: MilestoneTask[];
  onChange: (tasks: MilestoneTask[]) => void;
}) {
  const [addedId, setAddedId] = useState<string>();
  const completed = tasks.filter((task) => task.completed).length;
  return (
    <section
      className="milestone-task-editor"
      aria-label="マイルストーンの作業"
    >
      <h3>
        作業{" "}
        <small>
          {completed} / {tasks.length} 件完了
        </small>
      </h3>
      <p className="muted">到達点に向けて行うことを、1件ずつ追加します。</p>
      <ul className="milestone-task-fields" role="list">
        {tasks.map((task, index) => (
          <li key={task.id}>
            <label className="milestone-task-check">
              <input
                type="checkbox"
                checked={task.completed}
                aria-label={`作業${index + 1}「${task.title || "未入力"}」の完了`}
                onChange={(e) =>
                  onChange(
                    tasks.map((value) =>
                      value.id === task.id
                        ? { ...value, completed: e.target.checked }
                        : value,
                    ),
                  )
                }
              />
            </label>
            <input
              required
              maxLength={200}
              value={task.title}
              autoFocus={addedId === task.id}
              aria-label={`作業${index + 1}の名前`}
              placeholder="例：前半のステップを覚える"
              onChange={(e) =>
                onChange(
                  tasks.map((value) =>
                    value.id === task.id
                      ? { ...value, title: e.target.value }
                      : value,
                  ),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`作業${index + 1}「${task.title || "未入力"}」を削除`}
              onClick={() =>
                onChange(tasks.filter((value) => value.id !== task.id))
              }
            >
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const id = crypto.randomUUID();
          setAddedId(id);
          onChange([...tasks, { id, title: "", completed: false }]);
        }}
      >
        <Plus size={18} />
        作業を追加
      </button>
      <p className="muted milestone-task-save-hint">
        作業の追加・変更も「保存して戻る」で保存します。
      </p>
    </section>
  );
}

export function MilestoneTasks({
  eventId,
  milestone,
  onEdit,
}: {
  eventId: string;
  milestone: EventMilestone;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const progress = milestoneTaskProgress(milestone);
  async function toggle(id: string, completed: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await setMilestoneTaskCompleted(eventId, milestone.id, id, completed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="milestone-task-children">
      {progress.total > 0 && (
        <details className="milestone-task-disclosure" open>
          <summary>
            作業 {progress.completed} / {progress.total} 件完了
          </summary>
          <ul
            className="milestone-task-list"
            role="list"
            aria-label={`${milestone.title}の作業`}
            aria-busy={busy}
          >
            {(milestone.tasks ?? []).map((task) => (
              <li key={task.id}>
                <label className={task.completed ? "is-completed" : ""}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={busy}
                    onChange={(e) => void toggle(task.id, e.target.checked)}
                  />
                  <span>{task.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="text-button milestone-task-edit"
        onClick={onEdit}
      >
        <Plus size={16} />
        作業を追加・編集
      </button>
    </div>
  );
}
