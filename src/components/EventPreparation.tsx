import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Download,
  Plus,
  Pencil,
  MapPin,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { base } from "../data/repository";
import { dateLabel, localDate } from "../lib/dates";
import { sortedMilestones, type GanttScale } from "../lib/milestones";
import { MilestoneEditor } from "./MilestoneEditor";
import { MilestoneGantt } from "./MilestoneGantt";
import { EventMilestoneTimeline } from "./EventMilestoneTimeline";
import { EventWorkEditor } from "./EventWorkEditor";
import { sortedEventWork } from "../lib/eventWork";
import { scrollPageToTop } from "../lib/pageScroll";
import { downloadNotionSchedule } from "../lib/notionCsv";
import { MobilePreparationOverview } from "./MobilePreparationOverview";

export function EventPreparation({
  event,
  onBack,
  onEditEvent,
  onGoogleCalendar,
  onAiSchedule,
  onScheduleAdvice,
}: {
  event: DanceEvent;
  onBack: () => void;
  onEditEvent: () => void;
  onGoogleCalendar: () => void;
  onAiSchedule: () => void;
  onScheduleAdvice: () => void;
}) {
  const [view, setView] = useState("list");
  const [showMobileRoadmap, setShowMobileRoadmap] = useState(false);
  const [scale, setScale] = useState<GanttScale>("event");
  const [anchor, setAnchor] = useState(localDate);
  const [editing, setEditing] = useState<EventMilestone>();
  const [editingWork, setEditingWork] = useState<EventWorkItem>();
  const [exportNotice, setExportNotice] = useState("");
  const all = sortedMilestones(event.milestones ?? []);
  const allWork = sortedEventWork(event.workItems ?? []);
  const openWork = (item: EventWorkItem) => {
    setEditingWork(item);
    scrollPageToTop();
  };
  const addWork = (milestoneId: string) =>
    openWork({
      ...base(),
      milestoneId,
      title: "",
      description: "",
      priority: "medium",
      status: "not_started",
      changes: [],
    });
  if (editingWork)
    return (
      <EventWorkEditor
        key={editingWork.id}
        event={event}
        value={editingWork}
        onClose={() => {
          setEditingWork(undefined);
          scrollPageToTop();
        }}
        onNext={addWork}
      />
    );
  const open = (item: EventMilestone) => {
    setEditing(item);
    scrollPageToTop();
  };
  if (editing)
    return (
      <MilestoneEditor
        event={event}
        value={editing}
        onClose={() => {
          setEditing(undefined);
          scrollPageToTop();
        }}
      />
    );
  return (
    <section className="event-preparation">
      <button
        type="button"
        className="text-button agenda-back"
        onClick={onBack}
      >
        <ArrowLeft size={18} />
        イベント一覧に戻る
      </button>
      <div className="event-preparation-heading">
        <div>
          <h1>{event.title}</h1>
          <p className="event-preparation-meta">
            <span>{dateLabel(event.date)}</span>
            {event.location && (
              <span>
                <MapPin size={15} aria-hidden="true" />
                {event.location}
              </span>
            )}
          </p>
        </div>
        <details className="event-actions-menu">
          <summary>
            イベント操作
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="event-actions-panel">
            <div className="event-actions-group">
              <span>スケジュール作成・変更</span>
              <button
                type="button"
                className="text-button"
                onClick={onAiSchedule}
              >
                <Sparkles size={17} />
                AIでスケジュールを作成・見直す
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onScheduleAdvice}
              >
                <MessageCircleQuestion size={17} />
                スケジュールを変更・相談
              </button>
            </div>
            <div className="event-actions-group">
              <span>外部サービスで使う</span>
              <button
                type="button"
                className="text-button"
                onClick={onGoogleCalendar}
              >
                <CalendarPlus size={17} />
                Googleカレンダーへ登録
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!allWork.length}
                title={
                  allWork.length
                    ? undefined
                    : "作業を追加するとNotion用CSVを出力できます"
                }
                onClick={(clickEvent) => {
                  downloadNotionSchedule(event);
                  setExportNotice(
                    "Notion用CSVを保存しました。タイムラインの表示基準で「開始日」と「終了日」を指定すると、作業期間を1本のバーで表示できます。",
                  );
                  clickEvent.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                <Download size={17} />
                Notion用CSVを出力
              </button>
            </div>
            <div className="event-actions-group">
              <span>イベント管理</span>
              <button
                type="button"
                className="text-button"
                onClick={onEditEvent}
              >
                <Pencil size={17} />
                イベントを編集
              </button>
            </div>
            <div className="event-actions-group mobile-preparation-display-action">
              <span>表示</span>
              <button
                type="button"
                className="text-button"
                onClick={(clickEvent) => {
                  setView(view === "gantt" ? "list" : "gantt");
                  clickEvent.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                <CalendarDays size={17} />
                {view === "gantt" ? "今やることに戻る" : "ガントを表示"}
              </button>
            </div>
          </div>
        </details>
      </div>
      {exportNotice && (
        <p className="success event-export-notice" role="status">
          {exportNotice}
        </p>
      )}
      <section
        className={`card preparation-card ${
          showMobileRoadmap || view === "gantt" ? "is-roadmap-open" : ""
        }`}
      >
        <div className="section-heading">
          <div>
            <h2>準備スケジュール</h2>
            <p className="preparation-progress">
              {all.filter((item) => item.status === "achieved").length} /{" "}
              {all.filter((item) => item.status !== "skipped").length} 件達成
            </p>
          </div>
          <div
            className="segmented preparation-view-switch"
            role="group"
            aria-label="準備スケジュールの表示"
          >
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              ロードマップ
            </button>
            <button
              type="button"
              className={view === "gantt" ? "active" : ""}
              aria-pressed={view === "gantt"}
              onClick={() => setView("gantt")}
            >
              ガント
            </button>
          </div>
        </div>
        {!all.length && !allWork.length ? (
          <p className="empty">大会までに準備したい到達点を追加しましょう。</p>
        ) : view === "gantt" ? (
          <>
            <div className="mobile-gantt-return">
              <span>ガント表示</span>
              <button
                type="button"
                className="text-button"
                onClick={() => setView("list")}
              >
                今やることに戻る
              </button>
            </div>
            <MilestoneGantt
              event={event}
              items={all}
              onEdit={open}
              workItems={allWork}
              onEditWork={openWork}
              scale={scale}
              onScale={setScale}
              anchor={anchor}
              onAnchor={setAnchor}
            />
          </>
        ) : (
          <>
            <MobilePreparationOverview
              event={event}
              milestones={all}
              workItems={allWork}
              onEditWork={openWork}
              roadmapOpen={showMobileRoadmap}
              onToggleRoadmap={() =>
                setShowMobileRoadmap((current) => !current)
              }
            />
            <div
              className={`preparation-roadmap ${
                showMobileRoadmap ? "is-open" : ""
              }`}
            >
              <EventMilestoneTimeline
                event={event}
                items={all}
                workItems={allWork}
                onEdit={open}
                onEditWork={openWork}
                onAddWork={addWork}
                onEditEvent={onEditEvent}
              />
            </div>
          </>
        )}
        <div className="preparation-add-actions">
          <button
            type="button"
            className="secondary milestone-add"
            onClick={() =>
              open({
                ...base(),
                title: "",
                successCriteria: "",
                status: "not_started",
                changes: [],
              })
            }
          >
            <Plus size={18} />
            マイルストーンを追加
          </button>
        </div>
      </section>
    </section>
  );
}
