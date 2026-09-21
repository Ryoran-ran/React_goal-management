import { DatePicker } from "./DatePicker";
import { useState } from "react";
import {
  createLessonSchedule,
  previewLessonSchedule,
  type LessonSchedule,
} from "../data/lessonSchedule";
import { useQuery } from "../lib/hooks";
import { dateLabel, localDate } from "../lib/dates";
import { weekdayOptions } from "../lib/recurrence";
import { Editor, Field, SaveForm } from "./ui";

export function LessonScheduleEditor({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (count: number, firstDate: string) => void;
}) {
  const [schedule, setSchedule] = useState<LessonSchedule>({
    title: "",
    startDate: localDate(),
    endDate: "",
    weekdays: [],
    excludedDates: [],
  });
  const patch = (change: Partial<LessonSchedule>) =>
    setSchedule((old) => ({ ...old, ...change }));
  const preview = useQuery(
    () => previewLessonSchedule(schedule),
    [
      schedule.startDate,
      schedule.endDate,
      schedule.weekdays.join(","),
      schedule.excludedDates.join(","),
      schedule.title,
    ],
  );
  const count =
    preview.data?.filter((day) => !day.excluded && !day.duplicate).length ?? 0;
  return (
    <Editor title="毎週のレッスンをまとめて登録" onClose={onClose}>
      <SaveForm
        onCancel={onClose}
        saveLabel="まとめて登録する"
        onSave={async () => {
          const result = await createLessonSchedule(schedule);
          onCreated(result.created, result.firstDate);
        }}
      >
        <Field label="レッスン名（任意）">
          <input
            maxLength={200}
            value={schedule.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="例：木曜の個人レッスン"
          />
        </Field>
        <div className="form-grid">
          <Field label="開始日">
            <DatePicker
              required
              type="date"
              value={schedule.startDate}
              onChange={(nextDateValue) =>
                patch({ startDate: nextDateValue, excludedDates: [] })
              }
            />
          </Field>
          <Field label="終了日（任意・空欄なら終了日なし）">
            <DatePicker
              allowClear
              type="date"
              min={schedule.startDate}
              value={schedule.endDate ?? ""}
              onChange={(nextDateValue) =>
                patch({ endDate: nextDateValue, excludedDates: [] })
              }
            />
          </Field>
        </div>
        <fieldset className="choice-group">
          <legend>毎週の曜日（複数選択可）</legend>
          {weekdayOptions.map((day) => (
            <label
              className={`choice ${schedule.weekdays.includes(day.value) ? "selected" : ""}`}
              key={day.value}
            >
              <input
                type="checkbox"
                checked={schedule.weekdays.includes(day.value)}
                onChange={(e) =>
                  patch({
                    weekdays: e.target.checked
                      ? [...schedule.weekdays, day.value]
                      : schedule.weekdays.filter(
                          (value) => value !== day.value,
                        ),
                    excludedDates: [],
                  })
                }
              />
              {day.label}曜日
            </label>
          ))}
        </fieldset>
        <Field label="1回の時間（分・任意）">
          <input
            type="number"
            min="0"
            max="1440"
            value={schedule.durationMinutes ?? ""}
            onChange={(e) =>
              patch({
                durationMinutes:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
        <p className="muted lesson-edit-note">
          イベントは各回のレッスンを記録するときに選びます。目標はイベントごとに設定できます。
        </p>
        <section className="subform">
          <h3>
            登録する日を確認{!schedule.endDate && "（最初の8週間）"} · {count}回
          </h3>
          <p className="muted">
            お休みの日はチェックを外してください。登録後も各回の日付変更・中止ができます。
          </p>
          {preview.error && (
            <p className="muted" role="status">
              {preview.error}
            </p>
          )}
          {preview.data?.length === 0 && (
            <p className="muted">この期間には選択した曜日がありません。</p>
          )}
          <div className="schedule-preview">
            {preview.data?.map((day) => (
              <label className="task" key={day.date}>
                <input
                  type="checkbox"
                  disabled={day.duplicate}
                  checked={!day.excluded && !day.duplicate}
                  onChange={(e) =>
                    patch({
                      excludedDates: e.target.checked
                        ? schedule.excludedDates.filter(
                            (date) => date !== day.date,
                          )
                        : [...schedule.excludedDates, day.date],
                    })
                  }
                />
                <span>
                  {dateLabel(day.date)}
                  {day.duplicate && (
                    <small className="muted"> · 登録済み</small>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="muted">
            同じ名前・日付の登録済み予定は追加しません。日付変更・中止にした回も含みます。
            {schedule.endDate
              ? "終了日より先は自動追加されません。"
              : "終了日なしで登録します。8週間より先の予定も、一覧で表示する期間に合わせて追加されます。"}
          </p>
        </section>
      </SaveForm>
    </Editor>
  );
}
