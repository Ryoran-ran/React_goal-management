import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { DanceEvent, EventWorkItem } from "../types";
import { Field, SaveForm } from "./ui";
import { DatePicker } from "./DatePicker";
import { localDate } from "../lib/dates";
import { workPriorities, workStatuses } from "../lib/eventWork";
import { deleteEventWork, saveEventWork } from "../data/eventWork";

export function EventWorkEditor({
  event,
  value,
  onClose,
  onNext,
}: {
  event: DanceEvent;
  value: EventWorkItem;
  onClose: () => void;
  onNext: (milestoneId?: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [exists] = useState(() =>
    (event.workItems ?? []).some((item) => item.id === value.id),
  );
  const [reason, setReason] = useState("");
  const [addNext, setAddNext] = useState(false);
  const patch = (changes: Partial<EventWorkItem>) =>
    setDraft((current) => ({ ...current, ...changes }));
  return (
    <section className="milestone-editor-page">
      <button
        type="button"
        className="text-button agenda-back"
        onClick={onClose}
      >
        <ArrowLeft size={18} />
        準備スケジュールに戻る
      </button>
      <div className="card editor">
        <h2>{exists ? "作業を編集" : "作業を追加"}</h2>
        <p className="muted milestone-event-label">{event.title}</p>
        <SaveForm
          onCancel={onClose}
          saveLabel={addNext ? "保存して次の作業を追加" : "保存して戻る"}
          onSave={async () => {
            await saveEventWork(event.id, draft, reason, exists);
            if (addNext) onNext(draft.milestoneId);
            else onClose();
          }}
          onDelete={
            exists
              ? async () => {
                  await deleteEventWork(event.id, draft.id);
                  onClose();
                }
              : undefined
          }
          deleteConfirmation="この作業を削除しますか？マイルストーンとほかの作業は残ります。"
        >
          <Field label="作業名">
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="例：ルンバ前半を見本なしで踊る"
            />
          </Field>
          <Field label="関連するマイルストーン">
            <select
              value={draft.milestoneId ?? ""}
              onChange={(e) =>
                patch({ milestoneId: e.target.value || undefined })
              }
            >
              <option value="">未分類（後で選ぶ）</option>
              {(event.milestones ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="作業内容・完了の目安（任意）">
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="練習する範囲や、できたか確認する方法"
            />
          </Field>
          <div className="form-grid">
            <Field label="状態">
              <select
                value={draft.status}
                onChange={(e) => {
                  const status = e.target.value as EventWorkItem["status"];
                  patch({
                    status,
                    actualStartDate:
                      status === "in_progress"
                        ? (draft.actualStartDate ?? localDate())
                        : status === "not_started"
                          ? undefined
                          : draft.actualStartDate,
                    completedDate:
                      status === "completed"
                        ? (draft.completedDate ?? localDate())
                        : undefined,
                  });
                }}
              >
                {Object.entries(workStatuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="優先度">
              <select
                value={draft.priority}
                onChange={(e) =>
                  patch({
                    priority: e.target.value as EventWorkItem["priority"],
                  })
                }
              >
                {Object.entries(workPriorities).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <section className="work-schedule-section">
            <h3>作業の予定</h3>
            <div className="form-grid">
              <Field label="開始予定日（任意）">
                <DatePicker
                  type="date"
                  allowClear
                  value={draft.startDate ?? ""}
                  max={draft.dueDate}
                  onChange={(date) => patch({ startDate: date || undefined })}
                />
              </Field>
              <Field label="期限（任意）">
                <DatePicker
                  type="date"
                  allowClear
                  value={draft.dueDate ?? ""}
                  min={draft.startDate}
                  onChange={(date) => patch({ dueDate: date || undefined })}
                />
              </Field>
            </div>
            {exists &&
              (draft.startDate !== value.startDate ||
                draft.dueDate !== value.dueDate) && (
                <Field label="予定を変更する理由（任意）">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              )}
          </section>
          {draft.status !== "not_started" && (
            <div className="form-grid">
              <Field label="実際に始めた日（任意）">
                <DatePicker
                  type="date"
                  allowClear
                  value={draft.actualStartDate ?? ""}
                  max={draft.completedDate ?? localDate()}
                  onChange={(date) =>
                    patch({ actualStartDate: date || undefined })
                  }
                />
              </Field>
              {draft.status === "completed" && (
                <Field label="実際に完了した日（不明なら空欄）">
                  <DatePicker
                    type="date"
                    allowClear
                    value={draft.completedDate ?? ""}
                    min={draft.actualStartDate}
                    max={localDate()}
                    onChange={(date) =>
                      patch({ completedDate: date || undefined })
                    }
                  />
                </Field>
              )}
            </div>
          )}
          {draft.baseline && (
            <details className="milestone-history">
              <summary>当初の予定・変更履歴</summary>
              <p>
                当初：{draft.baseline.startDate ?? "開始未設定"} →{" "}
                {draft.baseline.dueDate ?? "期限未設定"}
              </p>
              {draft.changes.map((change, index) => (
                <div key={index}>
                  <time>{change.changedAt.slice(0, 10)}</time>
                  <p>
                    {change.from.startDate ?? "未設定"}〜
                    {change.from.dueDate ?? "未設定"} →{" "}
                    {change.to.startDate ?? "未設定"}〜
                    {change.to.dueDate ?? "未設定"}
                  </p>
                  {change.reason && <p>{change.reason}</p>}
                </div>
              ))}
            </details>
          )}
          {!exists && (
            <label className="choice">
              <input
                type="checkbox"
                checked={addNext}
                onChange={(e) => setAddNext(e.target.checked)}
              />
              保存後に次の作業を追加する
            </label>
          )}
        </SaveForm>
      </div>
    </section>
  );
}
