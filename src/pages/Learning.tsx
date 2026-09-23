import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Pencil,
} from "lucide-react";
import type { LearningNote, LearningTheme } from "../types";
import { allEvents } from "../data/repository";
import {
  learningOverview,
  newLearningNote,
  newTheme,
  nextStepFor,
  themeHistory,
} from "../data/learning";
import type { AgendaItem } from "../data/practiceAgenda";
import { agendaStatus } from "../data/practiceAgenda";
import { ensureLessonSchedules } from "../data/lessonSchedule";
import { useQuery } from "../lib/hooks";
import { addDays, dateLabel, daysUntil } from "../lib/dates";
import { nextMilestone, milestoneTiming } from "../lib/milestones";
import { FloatingAddButton } from "../components/FloatingAddButton";
import { ThemeEditor } from "../components/ThemeEditor";
import { LearningJournal } from "../components/LearningJournal";
import {
  LearningNoteEditor,
  noteKinds,
} from "../components/LearningNoteEditor";
import { scrollPageToTop } from "../lib/pageScroll";

export type LearningEntry = { note: LearningNote; exists: boolean };
type View =
  | { type: "list" }
  | { type: "theme"; id: string }
  | { type: "editTheme"; theme: LearningTheme }
  | { type: "editNote"; entry: LearningEntry; returnTheme?: string };

export function Learning({
  today,
  mode,
  entry,
  onSchedule,
  onEvents,
  onLegacy,
}: {
  today: string;
  mode: "themes" | "notes";
  entry?: LearningEntry;
  onSchedule: () => void;
  onEvents: (id?: string) => void;
  onLegacy: (item: AgendaItem, sectionId?: string) => void;
}) {
  const [view, setView] = useState<View>(
    entry ? { type: "editNote", entry } : { type: "list" },
  );
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const overview = useQuery(
    () => learningOverview(today),
    [today],
    () => ensureLessonSchedules(addDays(today, 55)),
  );
  const { data: allEventOptions = [] } = useQuery(allEvents);
  useEffect(() => {
    setView(entry ? { type: "editNote", entry } : { type: "list" });
    setNotice("");
  }, [entry, mode]);
  useEffect(() => {
    scrollPageToTop();
  }, [view.type, view.type === "theme" ? view.id : ""]);
  if (overview.error)
    return (
      <p className="error" role="alert">
        {overview.error}
      </p>
    );
  if (!overview.data) return <p role="status">学びのノートを開いています…</p>;
  const { themes, notes, events, agenda } = overview.data;
  const active = themes.filter((theme) => theme.status === "active");
  const record = (themeId?: string, kind: LearningNote["kind"] = "lesson") =>
    setView({
      type: "editNote",
      entry: {
        note: { ...newLearningNote(today, themeId), kind },
        exists: false,
      },
      returnTheme: themeId,
    });
  if (view.type === "editNote")
    return (
      <LearningNoteEditor
        key={view.entry.note.id}
        value={view.entry.note}
        themes={themes}
        exists={view.entry.exists}
        onClose={() =>
          setView(
            view.returnTheme
              ? { type: "theme", id: view.returnTheme }
              : { type: "list" },
          )
        }
        onSaved={() => {
          setNotice("記録を保存しました。");
          setView(
            view.returnTheme
              ? { type: "theme", id: view.returnTheme }
              : { type: "list" },
          );
        }}
      />
    );
  if (view.type === "editTheme")
    return (
      <ThemeEditor
        key={view.theme.id}
        value={view.theme}
        events={allEventOptions}
        onClose={() =>
          setView(
            themes.some((theme) => theme.id === view.theme.id)
              ? { type: "theme", id: view.theme.id }
              : { type: "list" },
          )
        }
        onSaved={(id) => {
          setNotice("テーマを保存しました。");
          setView({ type: "theme", id });
        }}
      />
    );
  if (view.type === "theme") {
    const theme = themes.find((theme) => theme.id === view.id);
    return theme ? (
      <ThemeDetail
        theme={theme}
        notes={notes}
        eventOptions={allEventOptions}
        notice={notice}
        onBack={() => {
          setView({ type: "list" });
          setNotice("");
        }}
        onEdit={() => setView({ type: "editTheme", theme })}
        onRecord={(kind) => record(theme.id, kind)}
        onNote={(note) =>
          setView({
            type: "editNote",
            entry: { note, exists: true },
            returnTheme: theme.id,
          })
        }
        onLegacy={onLegacy}
      />
    ) : (
      <p role="status">テーマを開いています…</p>
    );
  }
  const query = search.trim().normalize("NFKC").toLocaleLowerCase();
  const visibleThemes = (showAll ? themes : active).filter((theme) =>
    `${theme.title} ${theme.category}`
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(query),
  );
  return (
    <div
      className={`learning-page with-floating-add ${mode === "themes" ? "learning-home" : ""}`}
    >
      <header className="learning-heading">
        <h1>{mode === "themes" ? "今日" : "学びの記録"}</h1>
      </header>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {mode === "themes" ? (
        <>
          <section
            className="card today-schedule"
            aria-labelledby="today-schedule-heading"
          >
            <div className="section-heading">
              <h2 id="today-schedule-heading">
                <CalendarDays size={18} />
                今日の予定
              </h2>
              <span className="muted">{dateLabel(today)}</span>
            </div>
            <div
              className={`today-schedule-content ${agenda.length ? "" : "is-empty"}`}
            >
              {agenda.length ? (
                agenda.map((item) => (
                  <div
                    className="today-schedule-row"
                    key={`${item.kind}-${item.record.id}`}
                  >
                    <div>
                      <span className="muted">
                        {item.kind === "lesson" ? "レッスン" : "自主練習"}
                      </span>
                      <h3>
                        {item.record.title ||
                          (item.kind === "lesson" ? "レッスン" : "自主練習")}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className={
                        agendaStatus(item) === "recorded"
                          ? "secondary"
                          : "primary"
                      }
                      onClick={() => onLegacy(item)}
                    >
                      <Pencil size={18} />
                      {agendaStatus(item) === "recorded"
                        ? "記録を見る・編集"
                        : "記録する"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">今日の予定はありません。</p>
              )}
              <button
                type="button"
                className="text-button"
                onClick={onSchedule}
              >
                ほかの日の予定・予定の管理 <ArrowUpRight size={16} />
              </button>
            </div>
          </section>
          <div
            className={`learning-columns ${visibleThemes.length ? "" : "learning-columns-empty"}`}
          >
            <section
              className="card learning-theme-panel"
              aria-labelledby="theme-panel-heading"
            >
              <div className="section-heading">
                <h2 id="theme-panel-heading">
                  取り組むテーマ{" "}
                  <span className="theme-count">{active.length}</span>
                </h2>
                {themes.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? "今取り組むものだけ" : "お休み・完了も見る"}
                  </button>
                )}
              </div>
              {themes.length > 6 && (
                <input
                  className="learning-search"
                  type="search"
                  aria-label="テーマを探す"
                  placeholder="テーマ・種目で探す"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              {!visibleThemes.length && (
                <div className="learning-empty theme-empty">
                  <BookOpen size={28} />
                  <h3>
                    {themes.length
                      ? "この条件のテーマはありません"
                      : "最初のテーマをひとつ"}
                  </h3>
                  <p>
                    {themes.length
                      ? "表示条件を変えるか、新しいテーマを作れます。"
                      : "「ルンバの下半身の使い方」など、いま先生と取り組んでいることを登録しましょう。"}
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setView({ type: "editTheme", theme: newTheme() })
                    }
                  >
                    テーマを作る
                  </button>
                </div>
              )}
              <div className="theme-list">
                {visibleThemes.map((theme) => {
                  const next = nextStepFor(theme, notes);
                  const latest = notes.find(
                    (note) => note.themeId === theme.id,
                  );
                  return (
                    <section className="card theme-card" key={theme.id}>
                      <div className="section-heading">
                        <span className="tag green">
                          {theme.category || "テーマ"}
                        </span>
                        {theme.status !== "active" && (
                          <span className="tag">
                            {theme.status === "paused"
                              ? "お休み"
                              : "できるようになった"}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="theme-title"
                        onClick={() => setView({ type: "theme", id: theme.id })}
                      >
                        <h2>{theme.title}</h2>
                        <ArrowUpRight size={20} />
                      </button>
                      <div className="theme-next">
                        <span>次に試すこと</span>
                        <p className="pre-wrap">
                          {next ||
                            "教わったことを記録して、次の練習につなげましょう。"}
                        </p>
                      </div>
                      {latest && (
                        <p className="muted theme-last">
                          前回 {dateLabel(latest.date)} ·{" "}
                          {noteKinds[latest.kind]}
                        </p>
                      )}
                      <div className="focus-create-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => record(theme.id)}
                        >
                          このテーマで記録
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setView({ type: "theme", id: theme.id })
                          }
                        >
                          これまでの学びを見る
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
            <aside className="learning-context">
              <section className="card learning-event-panel">
                <div className="section-heading">
                  <h2>次の舞台</h2>
                </div>
                <div className="learning-events">
                  {events.length ? (
                    events.slice(0, 3).map((event) => (
                      <div className="learning-event" key={event.id}>
                        <strong>{event.title}</strong>
                        <span>
                          {dateLabel(event.date)} · あと
                          {daysUntil(event.date, today)}日
                        </span>
                        {nextMilestone(event) && (
                          <button
                            type="button"
                            className="text-button next-milestone-link"
                            onClick={() => onEvents(event.id)}
                          >
                            <span>
                              次の節目：{nextMilestone(event)!.title}
                              <small>
                                {milestoneTiming(nextMilestone(event)!, today)}
                              </small>
                            </span>
                            <ArrowUpRight size={16} />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      基礎を育てる時期も、自分のペースで。
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onEvents()}
                >
                  大会・イベントを見る
                  <ArrowUpRight size={16} />
                </button>
              </section>
              {!!notes.filter((note) => !note.themeId).length && (
                <section className="card">
                  <h2>テーマ未分類のメモ</h2>
                  <p>
                    {notes.filter((note) => !note.themeId).length}
                    件。テーマは後から選べます。
                  </p>
                  {notes
                    .filter((note) => !note.themeId)
                    .slice(0, 2)
                    .map((note) => (
                      <button
                        type="button"
                        className="unassigned-note"
                        key={note.id}
                        onClick={() =>
                          setView({
                            type: "editNote",
                            entry: { note, exists: true },
                          })
                        }
                      >
                        <span>{dateLabel(note.date)}</span>
                        <p className="clamp">
                          {note.memo || "添付資料・次に試すこと"}
                        </p>
                      </button>
                    ))}
                </section>
              )}
            </aside>
          </div>
        </>
      ) : (
        <LearningJournal
          themes={themes}
          onNote={(note) =>
            setView({ type: "editNote", entry: { note, exists: true } })
          }
          onScheduleRecord={onLegacy}
          onCreate={() => record()}
        />
      )}
      <FloatingAddButton
        actions={[
          { label: "学びを記録", onClick: () => record() },
          {
            label: "テーマを作る",
            onClick: () => setView({ type: "editTheme", theme: newTheme() }),
          },
        ]}
      />
    </div>
  );
}

function NoteCard({
  note,
  themeTitle,
  onOpen,
}: {
  note: LearningNote;
  themeTitle?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="card learning-note-card" onClick={onOpen}>
      <div className="section-heading">
        <span>{dateLabel(note.date)}</span>
        <span className="tag">{noteKinds[note.kind]}</span>
      </div>
      {themeTitle && <h3>{themeTitle}</h3>}
      <p className="pre-wrap">
        {note.memo || "画像・動画・次に試すことを記録"}
      </p>
      {note.nextStep && (
        <div className="theme-next">
          <span>次に試すこと</span>
          <p className="pre-wrap">{note.nextStep}</p>
        </div>
      )}
      <small className="muted">
        {note.attachmentIds.length
          ? `資料 ${note.attachmentIds.length}件 · `
          : ""}
        {note.youtubeUrls.filter(Boolean).length
          ? `YouTube ${note.youtubeUrls.filter(Boolean).length}件 · `
          : ""}
        開いて見返す ↗
      </small>
    </button>
  );
}

function ThemeDetail({
  theme,
  notes,
  eventOptions,
  notice,
  onBack,
  onEdit,
  onRecord,
  onNote,
  onLegacy,
}: {
  theme: LearningTheme;
  notes: LearningNote[];
  eventOptions: Awaited<ReturnType<typeof allEvents>>;
  notice: string;
  onBack: () => void;
  onEdit: () => void;
  onRecord: (kind: LearningNote["kind"]) => void;
  onNote: (note: LearningNote) => void;
  onLegacy: (item: AgendaItem) => void;
}) {
  const history = useQuery(
    () => themeHistory(theme),
    [theme.id, theme.updatedAt],
  );
  const [limit, setLimit] = useState(8);
  return (
    <div className="learning-page with-floating-add">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        テーマの一覧へ
      </button>
      <header className="learning-heading">
        {theme.category && <span className="tag green">{theme.category}</span>}
        <h1>{theme.title}</h1>
        <button type="button" className="text-button" onClick={onEdit}>
          テーマを整える
          <Pencil size={16} />
        </button>
      </header>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <section className="card theme-compass">
        {theme.destination && (
          <>
            <h3>できるようになりたいこと</h3>
            <p className="pre-wrap">{theme.destination}</p>
          </>
        )}
        <div className="theme-next">
          <span>次に試すこと</span>
          <p className="pre-wrap">
            {nextStepFor(theme, notes) ||
              "記録を見返して、次に意識することをひとつ決めましょう。"}
          </p>
        </div>
        <div className="focus-create-actions">
          <button
            type="button"
            className="primary"
            onClick={() => onRecord("lesson")}
          >
            レッスンを振り返る
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onRecord("practice")}
          >
            練習を振り返る
          </button>
        </div>
        {eventOptions
          .filter((event) => theme.eventIds.includes(event.id))
          .map((event) => (
            <p className="muted" key={event.id}>
              {event.title} · {dateLabel(event.date)} ·{" "}
              {daysUntil(event.date) >= 0
                ? `あと${daysUntil(event.date)}日`
                : "終了"}
            </p>
          ))}
      </section>
      <h2 className="learning-section-title">このテーマの積み重ね</h2>
      {history.error && (
        <p className="error" role="alert">
          {history.error}
        </p>
      )}
      {!history.data && !history.error && (
        <p role="status">記録を読み込み中…</p>
      )}
      {history.data?.notes.length === 0 && (
        <p className="muted">
          最初の学びを残すと、ここに日付順で積み重なります。
        </p>
      )}
      <div className="learning-timeline">
        {history.data?.notes.slice(0, limit).map((note) => (
          <NoteCard key={note.id} note={note} onOpen={() => onNote(note)} />
        ))}
      </div>
      {(history.data?.notes.length ?? 0) > limit && (
        <button
          type="button"
          className="secondary"
          onClick={() => setLimit(limit + 8)}
        >
          さらに8件を見る
        </button>
      )}
      {!!history.data?.legacy.length && (
        <details className="learning-optional">
          <summary>
            関連する以前の記録（{history.data.legacy.length}件）
          </summary>
          {history.data.legacy.map(({ item, text }) => (
            <button
              type="button"
              className="card learning-note-card"
              key={`${item.kind}-${item.record.id}`}
              onClick={() => onLegacy(item)}
            >
              <strong>
                {dateLabel(item.record.date)} ·{" "}
                {item.record.title ||
                  (item.kind === "lesson" ? "レッスン" : "自主練習")}
              </strong>
              <p className="clamp">{text || "記録を開く"}</p>
            </button>
          ))}
        </details>
      )}
      <FloatingAddButton
        actions={[
          { label: "教わったこと", onClick: () => onRecord("lesson") },
          { label: "練習の気づき", onClick: () => onRecord("practice") },
          { label: "振り返り", onClick: () => onRecord("reflection") },
        ]}
      />
    </div>
  );
}
