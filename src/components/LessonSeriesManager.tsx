import { DatePicker } from "./DatePicker";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  currentSeriesWeekdays,
  deleteLessonSeries,
  previewSeriesDeletion,
  listLessonSeries,
  previewSeriesChange,
  saveSeriesChange,
  type ManagedLessonSeries,
  type SeriesChange,
} from "../data/lessonSeries";
import { useQuery } from "../lib/hooks";
import { dateLabel } from "../lib/dates";
import { weekdayOptions } from "../lib/recurrence";
import { Editor, Empty, Field, SaveForm } from "./ui";
import { FloatingAddButton } from "./FloatingAddButton";

export function LessonSeriesManager({
  today,
  onAdd,
}: {
  today: string;
  onAdd: () => void;
}) {
  const result = useQuery(listLessonSeries);
  const [editing, setEditing] = useState<ManagedLessonSeries>();
  const [notice, setNotice] = useState("");
  if (editing)
    return (
      <>
        <button
          className="text-button agenda-back"
          onClick={() => setEditing(undefined)}
        >
          <ArrowLeft size={18} />
          繰り返しレッスンの一覧に戻る
        </button>
        <SeriesEditor
          key={editing.seriesId}
          value={editing}
          today={today}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setNotice("繰り返し設定と、対象の予定を更新しました。");
          }}
          onDeleted={({ removed, preserved }) => {
            setEditing(undefined);
            setNotice(
              `繰り返し設定と未編集の予定${removed}回を削除しました。${preserved}回は単発の予定・記録として残しました。`,
            );
          }}
        />
      </>
    );
  return (
    <div className="card-list with-floating-add">
      <div>
        <p className="muted">
          毎週の曜日・時間・終了日を設定します。1回だけの変更は予定一覧から行えます。
        </p>
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {result.error && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {!result.data && !result.error && (
        <p role="status">繰り返し設定を読み込み中…</p>
      )}
      {result.data?.map((series) => {
        const days = currentSeriesWeekdays(
          series,
          [today, series.schedule.startDate].sort().at(-1)!,
        );
        const ended =
          !!series.stoppedFrom ||
          (!!series.schedule.endDate && series.schedule.endDate < today);
        return (
          <button
            className="card lesson-card"
            key={series.seriesId}
            onClick={() => {
              setNotice("");
              setEditing(series);
              window.scrollTo({ top: 0 });
            }}
          >
            <header>
              <h3>{series.schedule.title || "毎週のレッスン"}</h3>
              <span className={`tag ${ended ? "" : "green"}`}>
                {ended ? "終了" : "継続中"}
              </span>
              <ArrowUpRight size={18} />
            </header>
            <p>
              毎週{" "}
              {weekdayOptions
                .filter((day) => days.includes(day.value))
                .map((day) => day.label)
                .join("・")}
              曜日 ·{" "}
              {series.schedule.durationMinutes === undefined
                ? "時間未設定"
                : `${series.schedule.durationMinutes}分`}
            </p>
            <p>
              {series.stoppedFrom
                ? `${series.stoppedFrom.replaceAll("-", "/")}から終了`
                : series.schedule.endDate
                  ? `終了日 ${series.schedule.endDate.replaceAll("-", "/")}`
                  : "終了日なし"}
            </p>
            <small className="muted">
              登録済みの予定 {series.plannedCount}回 · 実施済み{" "}
              {series.completedCount}回
            </small>
          </button>
        );
      })}
      {result.data?.length === 0 && (
        <section className="card">
          <Empty>
            繰り返しレッスンはまだありません。左下の＋から登録できます。
          </Empty>
        </section>
      )}
      <FloatingAddButton
        actions={[{ label: "毎週のレッスンを登録", onClick: onAdd }]}
      />
    </div>
  );
}
function SeriesEditor({
  value,
  today,
  onClose,
  onSaved,
  onDeleted,
}: {
  value: ManagedLessonSeries;
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (result: { removed: number; preserved: number }) => void;
}) {
  const from = [today, value.schedule.startDate].sort().at(-1)!;
  const [change, setChange] = useState<SeriesChange>({
    from,
    title: value.schedule.title,
    weekdays: currentSeriesWeekdays(value, from),
    durationMinutes: value.schedule.durationMinutes,
    endDate:
      value.schedule.endDate && value.schedule.endDate >= from
        ? value.schedule.endDate
        : "",
    stop: !!value.stoppedFrom,
  });
  const patch = (next: Partial<SeriesChange>) =>
    setChange((old) => ({ ...old, ...next }));
  const preview = useQuery(
    () => previewSeriesChange(value.seriesId, change, today),
    [value.seriesId, JSON.stringify(change), today],
  );
  const deletion = useQuery(
    () => previewSeriesDeletion(value.seriesId, today),
    [value.seriesId, today],
  );
  return (
    <Editor title="繰り返し設定を編集" onClose={onClose}>
      <SaveForm
        onCancel={onClose}
        saveLabel="変更を保存して設定一覧へ"
        deleteLabel="繰り返し設定を削除"
        deleteConfirmation={`「${value.schedule.title || "毎週のレッスン"}」の繰り返し設定と、今日以降の未編集の予定${deletion.data?.removed.length ?? 0}回を削除します。\n過去・記録済み・個別に編集した${deletion.data?.preserved.length ?? 0}回は単発の予定・記録として残ります。\n今後の自動追加は停止します。削除しますか？`}
        onDelete={
          deletion.data
            ? async () => {
                onDeleted(
                  await deleteLessonSeries(
                    value.seriesId,
                    value.revision ?? 0,
                    today,
                  ),
                );
              }
            : undefined
        }
        onSave={async () => {
          await saveSeriesChange(
            value.seriesId,
            change,
            value.revision ?? 0,
            today,
          );
          onSaved();
        }}
      >
        <details className="subform">
          <summary>繰り返し設定の削除について</summary>
          <p className="muted">
            画面下の「繰り返し設定を削除」で、自動追加を停止し、今日以降の未編集の予定を削除します。過去・記録済み・中止・振替・メモや画像のある回は、単発の予定・記録として残ります。
          </p>
          {deletion.error && (
            <p className="error" role="alert">
              {deletion.error}
            </p>
          )}
          {deletion.data && (
            <>
              <p>
                削除する予定 {deletion.data.removed.length}回 · 残す予定・記録{" "}
                {deletion.data.preserved.length}回
              </p>
              <div className="schedule-preview">
                {deletion.data.removed.map((lesson) => (
                  <p key={lesson.id}>削除：{dateLabel(lesson.date)}</p>
                ))}
                {deletion.data.preserved.map((lesson) => (
                  <p key={lesson.id}>
                    保持：{dateLabel(lesson.date)} ·{" "}
                    {lesson.title || "レッスン"}
                  </p>
                ))}
              </div>
            </>
          )}
        </details>
        {value.inferred && (
          <p className="muted lesson-edit-note">
            登録済みの各回から設定を表示しています。曜日と終了日を確認してください。
          </p>
        )}
        <Field label="レッスン名">
          <input
            maxLength={200}
            value={change.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="変更を反映する日">
            <DatePicker
              required
              type="date"
              min={today}
              value={change.from}
              onChange={(nextDateValue) => patch({ from: nextDateValue })}
            />
          </Field>
          <Field label="繰り返し">
            <select
              value={change.stop ? "stop" : "continue"}
              onChange={(e) => patch({ stop: e.target.value === "stop" })}
            >
              <option value="continue">継続する</option>
              <option value="stop">指定した日から終了する</option>
            </select>
          </Field>
        </div>
        {!change.stop && (
          <>
            <fieldset className="choice-group">
              <legend>毎週の曜日（複数選択可）</legend>
              {weekdayOptions.map((day) => (
                <label
                  className={`choice ${change.weekdays.includes(day.value) ? "selected" : ""}`}
                  key={day.value}
                >
                  <input
                    type="checkbox"
                    checked={change.weekdays.includes(day.value)}
                    onChange={(e) =>
                      patch({
                        weekdays: e.target.checked
                          ? [...change.weekdays, day.value]
                          : change.weekdays.filter(
                              (value) => value !== day.value,
                            ),
                      })
                    }
                  />
                  {day.label}曜日
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <Field label="1回の時間（分・任意）">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={change.durationMinutes ?? ""}
                  onChange={(e) =>
                    patch({
                      durationMinutes:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="終了日（任意・空欄なら終了日なし）">
                <DatePicker
                  allowClear
                  type="date"
                  min={change.from}
                  value={change.endDate ?? ""}
                  onChange={(nextDateValue) =>
                    patch({ endDate: nextDateValue })
                  }
                />
              </Field>
            </div>
          </>
        )}
        <section className="subform">
          <h3>変更する予定を確認</h3>
          <p className="muted">
            指定した日以降の、個別に編集していない予定に反映します。記録済み・中止・振替・メモや画像のある回は個別の内容を保持します。
          </p>
          {preview.error && (
            <p className="error" role="alert">
              {preview.error}
            </p>
          )}
          {!preview.data && !preview.error && <p role="status">確認中…</p>}
          {preview.data && (
            <>
              <p>
                更新 {preview.data.updated.length}回 · 新規追加{" "}
                {preview.data.added.length}回 · 取りやめ{" "}
                {preview.data.removed.length}回 · 個別の内容を保持{" "}
                {preview.data.preserved.length}回
              </p>
              <div className="schedule-preview">
                {preview.data.updated.map((lesson) => (
                  <p key={lesson.id}>更新：{dateLabel(lesson.date)}</p>
                ))}
                {preview.data.removed.map((lesson) => (
                  <p key={lesson.id}>取りやめ：{dateLabel(lesson.date)}</p>
                ))}
                {preview.data.added.map((date) => (
                  <p key={date}>追加：{dateLabel(date)}</p>
                ))}
                {preview.data.preserved.map((lesson) => (
                  <p key={lesson.id}>
                    保持：{dateLabel(lesson.date)} ·{" "}
                    {lesson.title || "レッスン"}
                  </p>
                ))}
              </div>
            </>
          )}
        </section>
      </SaveForm>
    </Editor>
  );
}
