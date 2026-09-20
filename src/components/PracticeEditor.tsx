import { useState } from "react";
import type { PracticeLog } from "../types";
import { Editor, Field, SaveForm } from "./ui";
import { Attachments, type ImageDraft } from "./Attachments";

export function PracticeEditor({
  value,
  exists,
  recording = false,
  onClose,
  onSave,
  onDelete,
}: {
  value: PracticeLog;
  exists: boolean;
  recording?: boolean;
  onClose: () => void;
  onSave: (log: PracticeLog, images: ImageDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [log, setLog] = useState<PracticeLog>(
    recording ? { ...value, status: "recorded", practiced: true } : value,
  );
  const [images, setImages] = useState<ImageDraft>({ files: [], removed: [] });
  const patch = (change: Partial<PracticeLog>) =>
    setLog((old) => ({ ...old, ...change }));
  const status = log.status ?? "recorded";
  return (
    <Editor
      title={
        recording
          ? "自主練習を記録"
          : exists
            ? "自主練習の予定・記録"
            : "自主練習を追加"
      }
      onClose={onClose}
    >
      <SaveForm
        saveLabel="保存して一覧に戻る"
        onCancel={onClose}
        onDelete={exists ? onDelete : undefined}
        onSave={() =>
          onSave(
            {
              ...log,
              status,
              practiced: status === "recorded" && log.practiced,
              durationMinutes:
                status === "recorded" && !log.practiced
                  ? undefined
                  : log.durationMinutes,
            },
            images,
          )
        }
      >
        <Field label="練習名（任意）">
          <input
            maxLength={200}
            value={log.title ?? ""}
            placeholder="例：ルンバウォークと体幹練習"
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="日付">
            <input
              required
              type="date"
              value={log.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
          <Field label="状態">
            <select
              value={
                status === "recorded"
                  ? log.practiced
                    ? "practiced"
                    : "rest"
                  : status
              }
              onChange={(e) => {
                const state = e.target.value;
                patch({
                  status:
                    state === "practiced" || state === "rest"
                      ? "recorded"
                      : (state as "planned" | "cancelled"),
                  practiced: state === "practiced",
                });
              }}
            >
              <option value="planned">予定（まだ記録していない）</option>
              <option value="practiced">記録済み・練習した</option>
              <option value="rest">記録済み・休息の日</option>
              <option value="cancelled">中止</option>
            </select>
          </Field>
        </div>
        <p className="muted lesson-edit-note">
          {recording
            ? "練習内容を記入して保存すると、記録済みになります。予定の変更・中止は「状態」で選べます。"
            : "自主練習は1日1件で管理します。練習後は一覧の「記録する」から、同じ予定に追記できます。"}
        </p>
        {(status === "planned" || (status === "recorded" && log.practiced)) && (
          <Field
            label={status === "planned" ? "予定時間（分）" : "練習時間（分）"}
          >
            <input
              type="number"
              min="0"
              max="1440"
              value={log.durationMinutes ?? ""}
              onChange={(e) =>
                patch({
                  durationMinutes:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        )}
        <Field label="練習する内容・予定メモ">
          <textarea
            value={log.plannedNote ?? ""}
            onChange={(e) => patch({ plannedNote: e.target.value })}
            placeholder="例：重心移動を意識して10分歩く"
          />
        </Field>
        {status === "recorded" && log.practiced && (
          <>
            <Field label="できたこと">
              <textarea
                value={log.whatWentWell ?? ""}
                onChange={(e) => patch({ whatWentWell: e.target.value })}
              />
            </Field>
            <Field label="もう少し練習したいこと">
              <textarea
                value={log.whatNeedsImprovement ?? ""}
                onChange={(e) =>
                  patch({ whatNeedsImprovement: e.target.value })
                }
              />
            </Field>
          </>
        )}
        <Field
          label={status === "cancelled" ? "中止のメモ" : "気づき・ひと言メモ"}
        >
          <textarea
            value={log.note ?? ""}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </Field>
        <Attachments
          type="practice"
          id={log.id}
          draft={images}
          onChange={setImages}
        />
      </SaveForm>
    </Editor>
  );
}
