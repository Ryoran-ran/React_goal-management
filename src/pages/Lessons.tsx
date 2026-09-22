import { DatePicker } from "../components/DatePicker";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Lesson, LessonTopic } from "../types";
import {
  allEvents,
  base,
  list,
  previousLesson,
  remove,
} from "../data/repository";
import {
  followingLessonDates,
  ensureLessonSchedules,
  saveLessonOccurrence,
} from "../data/lessonSchedule";
import { LessonScheduleEditor } from "../components/LessonScheduleEditor";
import { LessonSectionsEditor } from "../components/LessonSectionsEditor";
import { LessonSectionScreen } from "../components/LessonSectionScreen";
import { lessonHomework } from "../lib/lessonContent";
import { useQuery } from "../lib/hooks";
import { dateLabel, localDate, monthRange } from "../lib/dates";
import {
  Editor,
  Empty,
  Field,
  MultiSelect,
  PageHeading,
  SaveForm,
} from "../components/ui";
import { Attachments, type ImageDraft } from "../components/Attachments";
import { priorities } from "../lib/goalReview";
import { FloatingAddButton } from "../components/FloatingAddButton";
export function Lessons() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [editing, setEditing] = useState<Lesson>();
  const [scheduling, setScheduling] = useState(false);
  const result = useQuery(
    () => list("lessons", month),
    [month, !!editing, scheduling],
    () => ensureLessonSchedules(monthRange(month).end),
  );
  const [notice, setNotice] = useState("");
  const create = () => {
    setScheduling(false);
    setNotice("");
    setEditing({
      ...base(),
      date: localDate(),
      title: "",
      relatedEventIds: [],
      relatedGoalIds: [],
      plannedTopics: [],
      actualTopics: [],
      attachmentIds: [],
      completed: false,
    });
  };
  return (
    <>
      <PageHeading
        eyebrow="LESSONS"
        title="学びを、次の踊りへ"
        description="先生に見てもらうことと、持ち帰った気づきをひとつに。"
      />
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {scheduling ? (
        <LessonScheduleEditor
          onClose={() => setScheduling(false)}
          onCreated={(count, firstDate) => {
            setScheduling(false);
            setMonth(firstDate.slice(0, 7));
            setNotice(
              `${count}回のレッスン予定を登録しました。各回を開いて日付変更・中止ができます。`,
            );
          }}
        />
      ) : editing ? (
        <LessonEditor
          key={editing.id}
          value={editing}
          exists={result.data?.some((l) => l.id === editing.id) ?? false}
          onClose={() => setEditing(undefined)}
          onSaved={(date) => {
            setMonth(date.slice(0, 7));
            setEditing(undefined);
            setNotice("レッスンを保存しました。");
          }}
        />
      ) : (
        <>
          <div className="toolbar">
            <DatePicker
              aria-label="レッスンの表示月"
              type="month"
              value={month}
              onChange={(nextDateValue) =>
                nextDateValue && setMonth(nextDateValue)
              }
            />
            <span className="muted">
              予定{" "}
              {result.data?.filter((l) => !l.completed && !l.cancelled)
                .length ?? 0}
              回 · 実施{" "}
              {result.data?.filter((l) => l.completed && !l.cancelled).length ??
                0}
              回 · 中止 {result.data?.filter((l) => l.cancelled).length ?? 0}回
            </span>
          </div>
          <div className="card-list with-floating-add">
            {result.error && (
              <p className="error" role="alert">
                {result.error}
              </p>
            )}
            {result.data?.map((lesson) => (
              <button
                className={`card lesson-card ${lesson.cancelled ? "is-cancelled" : ""}`}
                key={lesson.id}
                onClick={() => {
                  setEditing(lesson);
                  setNotice("");
                }}
              >
                <header>
                  <span className="lesson-date">{dateLabel(lesson.date)}</span>
                  <span
                    className={`tag ${lesson.cancelled ? "cancelled" : lesson.completed ? "green" : ""}`}
                  >
                    {lesson.cancelled
                      ? "中止"
                      : lesson.completed
                        ? "実施済み"
                        : "予定"}
                  </span>
                </header>
                <h2>{lesson.title || "レッスン"}</h2>
                {lesson.seriesId && (
                  <p className="muted">
                    毎週の予定
                    {lesson.originalDate && lesson.date !== lesson.originalDate
                      ? ` · ${dateLabel(lesson.originalDate)}から変更`
                      : ""}
                  </p>
                )}
                {lesson.cancelled && lesson.cancellationReason && (
                  <p>中止理由：{lesson.cancellationReason}</p>
                )}
                <p>
                  {lesson.durationMinutes
                    ? `${lesson.durationMinutes}分`
                    : "時間未設定"}{" "}
                  · 確認事項 {lesson.plannedTopics.length}件
                </p>
                {lessonHomework(lesson) && (
                  <p className="clamp">宿題：{lessonHomework(lesson)}</p>
                )}
              </button>
            ))}
            {result.data?.length === 0 && (
              <div className="card">
                <Empty>
                  この月のレッスンはまだありません。左下の「追加」から登録できます。
                </Empty>
              </div>
            )}
          </div>
          <FloatingAddButton
            actions={[
              { label: "レッスンを1回追加", onClick: create },
              {
                label: "毎週の予定をまとめて登録",
                onClick: () => {
                  setScheduling(true);
                  setNotice("");
                },
              },
            ]}
          />
        </>
      )}
    </>
  );
}
export function LessonEditor({
  value,
  exists,
  recording = false,
  initialSectionId,
  onClose,
  onSaved,
}: {
  value: Lesson;
  exists: boolean;
  recording?: boolean;
  initialSectionId?: string;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  const [lesson, setLesson] = useState<Lesson>(
    recording ? { ...value, completed: true, cancelled: false } : value,
  );
  const [scope, setScope] = useState<"one" | "following">("one");
  const canChangeFollowing =
    !!value.seriesId &&
    value.date === (value.seriesDate ?? value.originalDate) &&
    !value.completed &&
    !value.cancelled &&
    !lesson.completed &&
    !lesson.cancelled &&
    lesson.date !== value.date;
  const following = useQuery(
    () => followingLessonDates(value, lesson.date),
    [value.id, value.date, lesson.date],
  );
  const [images, setImages] = useState<ImageDraft>({ files: [], removed: [] });
  const [sectionId, setSectionId] = useState<string | undefined>(
    initialSectionId,
  );
  const sectionReturnFocus = useRef<HTMLElement | null>(null);
  const sectionScroll = useRef(0);
  const editingSection = lesson.sections?.find(
    (section) => section.id === sectionId,
  );
  const openSection = (id: string) => {
    sectionReturnFocus.current = document.activeElement as HTMLElement | null;
    sectionScroll.current = window.scrollY;
    setSectionId(id);
    window.scrollTo({ top: 0 });
  };
  const closeSection = () => {
    setSectionId(undefined);
    requestAnimationFrame(() => {
      sectionReturnFocus.current?.focus({ preventScroll: true });
      window.scrollTo({ top: sectionScroll.current });
    });
  };
  const { data: events = [] } = useQuery(allEvents);
  const previous = useQuery(
    () => previousLesson(lesson.date, lesson.id),
    [lesson.date, lesson.id],
  );
  const patch = (value: Partial<Lesson>) =>
    setLesson((old) => ({ ...old, ...value }));
  return (
    <>
      {editingSection && (
        <LessonSectionScreen
          key={editingSection.id}
          lessonId={lesson.id}
          section={editingSection}
          sections={lesson.sections ?? []}
          onChange={(updated) =>
            setLesson((old) => ({
              ...old,
              sections: old.sections?.map((section) =>
                section.id === updated.id ? updated : section,
              ),
            }))
          }
          media={images}
          onMediaChange={setImages}
          onBack={closeSection}
        />
      )}
      <div className="lesson-edit-page" hidden={!!editingSection}>
        <Editor
          title={
            recording
              ? "レッスンを記録"
              : exists
                ? "レッスンを編集"
                : "新しいレッスン"
          }
          onClose={onClose}
        >
          <SaveForm
            saveLabel="保存して一覧に戻る"
            onCancel={onClose}
            onSave={async () => {
              await saveLessonOccurrence(
                lesson,
                images.files,
                images.removed,
                canChangeFollowing ? scope : "one",
                value,
                images.fileSectionIds,
              );
              onSaved(lesson.date);
            }}
            onDelete={
              exists
                ? async () => {
                    await remove("lessons", lesson.id);
                    onClose();
                  }
                : undefined
            }
          >
            <section className="lesson-form-section" aria-label="基本情報">
              <h3 className="lesson-section-title">基本情報</h3>
              <Field label="レッスン名（任意）">
                <input
                  value={lesson.title ?? ""}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="例：ラテン個人レッスン"
                />
              </Field>
              <div className="form-grid">
                <Field label="日付">
                  <DatePicker
                    required
                    type="date"
                    value={lesson.date}
                    onChange={(nextDateValue) => patch({ date: nextDateValue })}
                  />
                </Field>
                <Field label="時間（分）">
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={lesson.durationMinutes ?? ""}
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
              </div>
              <Field label="状態">
                <select
                  value={
                    lesson.cancelled
                      ? "cancelled"
                      : lesson.completed
                        ? "completed"
                        : "planned"
                  }
                  onChange={(e) => {
                    patch({
                      cancelled: e.target.value === "cancelled",
                      completed: e.target.value === "completed",
                    });
                    setScope("one");
                  }}
                >
                  <option value="planned">予定</option>
                  <option value="completed">実施済み</option>
                  <option value="cancelled">中止</option>
                </select>
              </Field>
              {lesson.cancelled && (
                <Field label="中止理由（任意）">
                  <input
                    value={lesson.cancellationReason ?? ""}
                    onChange={(e) =>
                      patch({ cancellationReason: e.target.value })
                    }
                    placeholder="例：先生の都合でお休み"
                  />
                </Field>
              )}
              {value.seriesId && (
                <p className="muted lesson-edit-note">
                  通常の編集・中止はこの回だけに反映されます。中止後も「予定」に戻せます。
                </p>
              )}
              {canChangeFollowing && (
                <section className="subform">
                  <Field label="日付変更の範囲">
                    <select
                      value={scope}
                      onChange={(e) =>
                        setScope(e.target.value as "one" | "following")
                      }
                    >
                      <option value="one">この回だけ</option>
                      <option value="following">
                        この回以降の同じ曜日の予定
                      </option>
                    </select>
                  </Field>
                  <p className="muted">
                    まとめて変更する場合も、個別に日付変更した回・中止した回・実施済みの回はそのまま残します。ほかの回の内容やメモは変更しません。
                  </p>
                  {scope === "following" && (
                    <>
                      <h3>変更する日付</h3>
                      <p>
                        {dateLabel(value.date)} →{" "}
                        {lesson.date ? dateLabel(lesson.date) : "日付を選択"}
                      </p>
                      {following.error && (
                        <p className="error" role="alert">
                          {following.error}
                        </p>
                      )}
                      <div className="schedule-preview">
                        {following.data?.map((change) => (
                          <p key={change.id}>
                            {dateLabel(change.from)} → {dateLabel(change.to)}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
              {lesson.completed || lesson.relatedEventIds.length > 0 ? (
                <>
                  <MultiSelect
                    label="今回のレッスンに関連するイベント（任意・複数選択可）"
                    options={events.map((event) => ({
                      id: event.id,
                      title: `${event.title}（${dateLabel(event.date)}）`,
                    }))}
                    value={lesson.relatedEventIds}
                    onChange={(relatedEventIds) => patch({ relatedEventIds })}
                  />
                  <p className="muted lesson-edit-note">
                    イベントを選ばずに記録することもできます。選択はこの回だけに反映されます。
                  </p>
                </>
              ) : (
                <p className="muted lesson-edit-note">
                  イベントは「記録する」で開いたときに選べます。
                </p>
              )}
            </section>
            {previous.data && lessonHomework(previous.data) && (
              <div className="subform">
                <h3>前回の宿題 · {dateLabel(previous.data.date)}</h3>
                <p className="pre-wrap">{lessonHomework(previous.data)}</p>
              </div>
            )}
            <section
              className="lesson-form-section"
              aria-label="先生に見てもらいたいこと"
            >
              <Topics
                title="先生に見てもらいたいこと"
                topics={lesson.plannedTopics}
                onChange={(plannedTopics) => patch({ plannedTopics })}
              />
            </section>
            <LessonSectionsEditor
              lessonId={lesson.id}
              sections={lesson.sections ?? []}
              onChange={(sections) => patch({ sections })}
              media={images}
              onMediaChange={setImages}
              onOpenSection={openSection}
            />
            <details
              className="lesson-general-notes lesson-form-section"
              open={
                !!(
                  value.actualTopics.length ||
                  value.teacherFeedback ||
                  value.newIssues ||
                  value.homework ||
                  (value.attachmentIds.length && !value.sections?.length)
                )
              }
            >
              <summary>レッスン全体のメモ・資料</summary>
              <Topics
                title="実際に扱った内容"
                topics={lesson.actualTopics}
                onChange={(actualTopics) => patch({ actualTopics })}
              />
              <Field label="先生からの指摘・改善点">
                <textarea
                  value={lesson.teacherFeedback ?? ""}
                  onChange={(e) => patch({ teacherFeedback: e.target.value })}
                />
              </Field>
              <Field label="新しく見つかった課題">
                <textarea
                  value={lesson.newIssues ?? ""}
                  onChange={(e) => patch({ newIssues: e.target.value })}
                />
              </Field>
              <Field label="次回までの宿題">
                <textarea
                  value={lesson.homework ?? ""}
                  onChange={(e) => patch({ homework: e.target.value })}
                />
              </Field>
              <Attachments
                type="lesson"
                id={lesson.id}
                draft={images}
                onChange={setImages}
              />
            </details>
          </SaveForm>
        </Editor>
      </div>
    </>
  );
}
function Topics({
  title,
  topics,
  onChange,
}: {
  title: string;
  topics: LessonTopic[];
  onChange: (topics: LessonTopic[]) => void;
}) {
  return (
    <div>
      <div className="section-heading">
        <h3>{title}</h3>
        <button
          className="text-button"
          type="button"
          onClick={() =>
            onChange([
              ...topics,
              { id: crypto.randomUUID(), title: "", priority: "medium" },
            ])
          }
        >
          <Plus size={16} />
          追加
        </button>
      </div>
      {topics.map((topic, index) => {
        const update = (value: Partial<LessonTopic>) =>
          onChange(
            topics.map((t) => (t.id === topic.id ? { ...t, ...value } : t)),
          );
        return (
          <div className="subform" key={topic.id}>
            <div className="task-edit">
              <input
                type="checkbox"
                checked={topic.completed ?? false}
                aria-label={`${title} ${index + 1} 確認済み`}
                onChange={(e) => update({ completed: e.target.checked })}
              />
              <input
                required
                aria-label={`${title} ${index + 1}`}
                value={topic.title}
                onChange={(e) => update({ title: e.target.value })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="内容を削除"
                onClick={() =>
                  onChange(topics.filter((t) => t.id !== topic.id))
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="form-grid">
              <Field label="優先度">
                <select
                  value={topic.priority}
                  onChange={(e) =>
                    update({
                      priority: e.target.value as LessonTopic["priority"],
                    })
                  }
                >
                  {Object.entries(priorities).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}
