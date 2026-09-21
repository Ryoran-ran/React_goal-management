import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { DanceEvent, EventMilestone } from "../types";
import { addDays, daysUntil, localDate } from "../lib/dates";
import { milestoneStatuses } from "../lib/milestones";
import {
  deleteEventMilestone,
  saveEventMilestone,
} from "../data/eventMilestones";
import { DatePicker } from "./DatePicker";
import { Field, SaveForm } from "./ui";

export function MilestoneEditor({
  event,
  value,
  onClose,
}: {
  event: DanceEvent;
  value: EventMilestone;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [exists] = useState(() =>
    (event.milestones ?? []).some((item) => item.id === value.id),
  );
  const [reason, setReason] = useState("");
  const [dueMode, setDueMode] = useState("date");
  const [daysBefore, setDaysBefore] = useState(
    value.dueDate ? String(daysUntil(event.date, value.dueDate)) : "",
  );
  const patch = (values: Partial<EventMilestone>) =>
    setDraft((current) => ({ ...current, ...values }));
  const changed =
    exists &&
    (value.startDate !== draft.startDate || value.dueDate !== draft.dueDate);
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
        <h2>{exists ? "マイルストーンを編集" : "マイルストーンを追加"}</h2>
        <p className="muted milestone-event-label">
          {event.title} · {event.date.replaceAll("-", "/")}
        </p>
        <SaveForm
          onCancel={onClose}
          saveLabel="保存して戻る"
          onSave={async () => {
            await saveEventMilestone(event.id, draft, reason, exists);
            onClose();
          }}
          onDelete={
            exists
              ? async () => {
                  await deleteEventMilestone(event.id, draft.id);
                  onClose();
                }
              : undefined
          }
          deleteConfirmation="このマイルストーンを削除しますか？関連する作業は「未分類」に移し、予定・実績を残します。"
        >
          <Field label="到達点">
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="例：ルンバの振り付けを最後まで覚える"
            />
          </Field>
          <Field label="達成の確認方法（任意）">
            <textarea
              value={draft.successCriteria}
              onChange={(e) => patch({ successCriteria: e.target.value })}
              placeholder="例：見本を見ず、最後まで順番を再現できる"
            />
          </Field>
          <p className="muted milestone-definition">
            ここでは到達点と期限を設定します。具体的な作業と予定期間は、一覧の「作業を追加」から登録できます。
          </p>
          <div>
            <Field label="期限の指定方法">
              <select
                value={dueMode}
                onChange={(e) => setDueMode(e.target.value)}
              >
                <option value="date">日付を選ぶ</option>
                <option value="before">イベントの何日前か指定</option>
              </select>
            </Field>
          </div>
          {dueMode === "date" ? (
            <Field label="期限（任意）">
              <DatePicker
                type="date"
                allowClear
                value={draft.dueDate ?? ""}
                onChange={(value) => {
                  patch({ dueDate: value || undefined });
                  setDaysBefore(
                    value ? String(daysUntil(event.date, value)) : "",
                  );
                }}
              />
            </Field>
          ) : (
            <Field label="イベントの何日前までに">
              <input
                type="number"
                min={0}
                max={3650}
                step={1}
                value={daysBefore}
                onChange={(e) => {
                  const value = e.target.value;
                  setDaysBefore(value);
                  if (!value) patch({ dueDate: undefined });
                  else if (
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 0 &&
                    Number(value) <= 3650
                  )
                    patch({ dueDate: addDays(event.date, -Number(value)) });
                }}
              />
              <small>
                {draft.dueDate
                  ? `期限：${draft.dueDate.replaceAll("-", "/")}`
                  : "期限未設定"}
              </small>
            </Field>
          )}
          {draft.dueDate && draft.dueDate > event.date && (
            <p className="muted">
              期限がイベントの開催日より後になっています。
            </p>
          )}
          {changed && (
            <Field label="計画を変更する理由（任意）">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：振り付けを一部変更したため"
              />
            </Field>
          )}
          <Field label="状態">
            <select
              value={draft.status}
              onChange={(e) => {
                const status = e.target.value as EventMilestone["status"];
                patch({
                  status,
                  completedDate:
                    status === "achieved"
                      ? (draft.completedDate ?? localDate())
                      : undefined,
                });
              }}
            >
              {Object.entries(milestoneStatuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {draft.status === "achieved" && (
            <div className="form-grid">
              {draft.status === "achieved" && (
                <Field label="実際に達成した日">
                  <DatePicker
                    required
                    type="date"
                    value={draft.completedDate ?? ""}
                    min={draft.actualStartDate}
                    max={localDate()}
                    onChange={(value) => patch({ completedDate: value })}
                  />
                </Field>
              )}
            </div>
          )}
          {(draft.baseline || draft.changes.length > 0) && (
            <details className="milestone-history">
              <summary>当初の計画・変更履歴</summary>
              <p>
                当初：{draft.baseline?.startDate ?? "開始未設定"} →{" "}
                {draft.baseline?.dueDate ?? "期限未設定"}
              </p>
              {draft.changes.map((change, i) => (
                <div key={i}>
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
          {(draft.startDate || draft.actualStartDate) && (
            <details className="milestone-history">
              <summary>以前に登録した開始日</summary>
              <Field label="以前の開始予定日（不要なら解除）">
                <DatePicker
                  type="date"
                  allowClear
                  value={draft.startDate ?? ""}
                  max={draft.dueDate}
                  onChange={(date) => patch({ startDate: date || undefined })}
                />
              </Field>
              <Field label="以前の実際に始めた日（不要なら解除）">
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
            </details>
          )}
        </SaveForm>
      </div>
    </section>
  );
}
