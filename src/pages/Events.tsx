import { DatePicker } from "../components/DatePicker";
import { useState } from "react";
import { CalendarDays, ArrowUpRight } from "lucide-react";
import type { DanceEvent } from "../types";
import { allEvents, base, remove, save } from "../data/repository";
import { useQuery } from "../lib/hooks";
import { dateLabel, daysUntil, localDate } from "../lib/dates";
import { Editor, Empty, Field, PageHeading, SaveForm } from "../components/ui";
import { Attachments, type ImageDraft } from "../components/Attachments";
export const eventTypes = {
  competition: "競技会",
  medal_test: "メダルテスト",
  performance: "発表会",
  demo: "デモ",
  other: "その他",
};
const statuses = {
  planned: "予定",
  active: "準備中",
  completed: "完了",
  cancelled: "中止",
};
export function Events() {
  const { data: events, error } = useQuery(allEvents);
  const [editing, setEditing] = useState<DanceEvent>();
  const create = () =>
    setEditing({
      ...base(),
      title: "",
      type: "competition",
      date: localDate(),
      status: "planned",
      goalIds: [],
    });
  return (
    <>
      <PageHeading
        eyebrow="EVENTS"
        title="イベント"
        description="大会までの時間を意識して、目指す踊りを育てましょう。取り組むテーマとの関連付けは「テーマを整える」から。"
        action={editing ? undefined : "イベントを追加"}
        onAction={create}
      />
      {editing ? (
        <EventEditor
          key={editing.id}
          value={editing}
          onClose={() => setEditing(undefined)}
          exists={events?.some((e) => e.id === editing.id) ?? false}
        />
      ) : (
        <div className="card-list with-floating-add">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {events?.map((event) => (
            <button
              className="event-row card"
              key={event.id}
              onClick={() => setEditing(event)}
            >
              <div className="date-tile">
                <span>
                  {new Date(`${event.date}T12:00:00`).getMonth() + 1}月
                </span>
                <strong>{Number(event.date.slice(8))}</strong>
              </div>

              <div className="row-content">
                <span className="tag">{eventTypes[event.type]}</span>
                <h2>{event.title}</h2>
                <p>
                  {dateLabel(event.date)} · {statuses[event.status]}
                </p>
                {event.description && (
                  <p className="clamp">{event.description}</p>
                )}
              </div>

              <span className="countdown">
                {daysUntil(event.date) >= 0 &&
                ["planned", "active"].includes(event.status) ? (
                  <>
                    あと <strong>{daysUntil(event.date)}</strong> 日
                  </>
                ) : (
                  statuses[event.status]
                )}
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
          {events?.length === 0 && (
            <div className="card">
              <CalendarDays className="empty-icon" />
              <Empty>
                左下の「追加」から、次の競技会やメダルテストを登録しましょう。
              </Empty>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function EventEditor({
  value,
  onClose,
  exists,
}: {
  value: DanceEvent;
  onClose: () => void;
  exists: boolean;
}) {
  const [event, setEvent] = useState(value);
  const [images, setImages] = useState<ImageDraft>({ files: [], removed: [] });
  const patch = (value: Partial<DanceEvent>) =>
    setEvent((old) => ({ ...old, ...value }));
  return (
    <>
      <Editor
        title={exists ? "イベントを編集" : "新しいイベント"}
        onClose={onClose}
      >
        <SaveForm
          onCancel={onClose}
          onSave={async () => {
            await save("events", event, images.files, images.removed);
            onClose();
          }}
          onDelete={
            exists
              ? async () => {
                  await remove("events", event.id);
                  onClose();
                }
              : undefined
          }
        >
          <Field label="イベント名">
            <input
              required
              maxLength={200}
              value={event.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="例：秋季C級競技会"
            />
          </Field>
          <div className="form-grid">
            <Field label="種類">
              <select
                value={event.type}
                onChange={(e) =>
                  patch({ type: e.target.value as DanceEvent["type"] })
                }
              >
                {Object.entries(eventTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="開催日">
              <DatePicker
                required
                type="date"
                value={event.date}
                onChange={(nextDateValue) => patch({ date: nextDateValue })}
              />
            </Field>
          </div>
          <Field label="状態">
            <select
              value={event.status}
              onChange={(e) =>
                patch({ status: e.target.value as DanceEvent["status"] })
              }
            >
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="メモ">
            <textarea
              value={event.description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Attachments
            type="event"
            id={event.id}
            draft={images}
            onChange={setImages}
          />
        </SaveForm>
      </Editor>
    </>
  );
}
