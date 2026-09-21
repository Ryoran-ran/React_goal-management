import { DatePicker } from "../components/DatePicker";
import { lazy, Suspense, useState } from "react";
import { CalendarDays, ArrowUpRight } from "lucide-react";
import type { DanceEvent } from "../types";
import { allEvents, base, remove } from "../data/repository";
import { saveEventDetails } from "../data/eventMilestones";
import { nextMilestone, milestoneTiming, unfinished } from "../lib/milestones";
import { useQuery } from "../lib/hooks";
import { dateLabel, daysUntil, localDate } from "../lib/dates";
import {
  readShowFinishedEvents,
  saveShowFinishedEvents,
} from "../lib/eventView";
import { Editor, Empty, Field, PageHeading, SaveForm } from "../components/ui";
import { Attachments, type ImageDraft } from "../components/Attachments";
const EventPreparation = lazy(() =>
  import("../components/EventPreparation").then((module) => ({
    default: module.EventPreparation,
  })),
);
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
export function Events({ initialEventId }: { initialEventId?: string }) {
  const { data: events, error } = useQuery(allEvents);
  const [editing, setEditing] = useState<DanceEvent>();
  const [selectedId, setSelectedId] = useState(initialEventId);
  const selected = events?.find((event) => event.id === selectedId);
  const [showFinished, setShowFinished] = useState(readShowFinishedEvents);
  const visibleEvents = events?.filter(
    (event) =>
      showFinished || !["completed", "cancelled"].includes(event.status),
  );
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
      {!selectedId && (
        <PageHeading
          eyebrow="EVENTS"
          title="イベント"
          description="大会までの時間を意識して、目指す踊りを育てましょう。取り組むテーマとの関連付けは「テーマを整える」から。"
          action={editing ? undefined : "イベントを追加"}
          onAction={create}
        />
      )}
      {editing ? (
        <EventEditor
          key={editing.id}
          value={editing}
          onClose={() => setEditing(undefined)}
          onDeleted={() => {
            setEditing(undefined);
            setSelectedId(undefined);
          }}
          onSaved={() => {
            setSelectedId(editing.id);
            setEditing(undefined);
          }}
          exists={events?.some((e) => e.id === editing.id) ?? false}
        />
      ) : selected ? (
        <Suspense fallback={<p role="status">準備スケジュールを読み込み中…</p>}>
          <EventPreparation
            event={selected}
            onBack={() => setSelectedId(undefined)}
            onEditEvent={() => setEditing(selected)}
          />
        </Suspense>
      ) : selectedId ? (
        <div className="card">
          <p>
            {error ?? (events ? "イベントが見つかりません。" : "読み込み中…")}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setSelectedId(undefined)}
          >
            イベント一覧に戻る
          </button>
        </div>
      ) : (
        <div className="card-list with-floating-add">
          <div className="toolbar">
            <label className="choice">
              <input
                type="checkbox"
                checked={showFinished}
                onChange={(event) => {
                  setShowFinished(event.target.checked);
                  saveShowFinishedEvents(event.target.checked);
                }}
              />
              完了・中止も表示
            </label>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {visibleEvents?.map((event) => (
            <button
              className="event-row card"
              key={event.id}
              onClick={() => {
                setSelectedId(event.id);
                window.scrollTo({ top: 0 });
              }}
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
                {nextMilestone(event) && (
                  <p className="event-next-milestone">
                    次の節目：{nextMilestone(event)!.title} ·{" "}
                    {milestoneTiming(nextMilestone(event)!)}
                  </p>
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
          {visibleEvents?.length === 0 && (
            <div className="card">
              <CalendarDays className="empty-icon" />
              <Empty>
                {events?.length ? (
                  <>
                    表示中のイベントはありません。「完了・中止も表示」をオンにすると、完了・中止したイベントを確認できます。
                  </>
                ) : (
                  <>
                    左下の「追加」から、次の競技会やメダルテストを登録しましょう。
                  </>
                )}
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
  onDeleted,
  onSaved,
}: {
  value: DanceEvent;
  onClose: () => void;
  exists: boolean;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const [event, setEvent] = useState(value);
  const [images, setImages] = useState<ImageDraft>({ files: [], removed: [] });
  const [shift, setShift] = useState(false);
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
            await saveEventDetails(event, images.files, images.removed, shift);
            onSaved();
          }}
          onDelete={
            exists
              ? async () => {
                  await remove("events", event.id);
                  onDeleted();
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
          {exists &&
            value.date !== event.date &&
            (value.milestones?.some(unfinished) ||
              value.workItems?.some((item) => item.status !== "completed")) && (
              <div className="event-date-shift">
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={shift}
                    onChange={(e) => setShift(e.target.checked)}
                  />
                  未達成の節目・未完了の作業の予定も同じ日数ずらす
                </label>
                <p className="muted">
                  {daysUntil(event.date, value.date)}
                  日変更します。当初計画・実績・達成済み・見送りの項目はそのまま残ります。
                </p>
              </div>
            )}
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
