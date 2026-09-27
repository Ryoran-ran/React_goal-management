import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock3 } from "lucide-react";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { countdownLabel, daysUntil, localDate } from "../lib/dates";
import { preparationWorkGroups } from "../lib/preparationOverview";
import { scheduleTiming } from "../lib/milestones";
import { workProgress, workSchedule } from "../lib/eventWork";
import { ScheduleStatus } from "./ScheduleStatus";

export function MobilePreparationOverview({
  event,
  milestones,
  workItems,
  onEditWork,
}: {
  event: DanceEvent;
  milestones: EventMilestone[];
  workItems: EventWorkItem[];
  onEditWork: (item: EventWorkItem) => void;
}) {
  const today = localDate();
  const groups = preparationWorkGroups(workItems, today);
  const progress = workProgress(workItems);
  const activeMilestones = milestones.filter(
    (item) => item.status !== "skipped",
  );
  const achievedMilestones = activeMilestones.filter(
    (item) => item.status === "achieved",
  ).length;
  const milestoneTitles = new Map(
    milestones.map((item) => [item.id, item.title]),
  );
  const [expanded, setExpanded] = useState(() =>
    groups
      .filter((group) => group.id === "overdue" || group.id === "now")
      .map((group) => group.id),
  );
  const eventDays = daysUntil(event.date, today);

  return (
    <div className="mobile-preparation-overview">
      <section
        className="mobile-preparation-summary"
        aria-label="準備の全体状況"
      >
        <div>
          <span>{eventDays >= 0 ? "イベントまで" : "イベント開催から"}</span>
          <strong>
            {eventDays >= 0
              ? countdownLabel(event.date, today)
              : `${-eventDays}日経過`}
          </strong>
        </div>
        <div className="mobile-preparation-progress-label">
          <span>作業</span>
          <strong>
            {progress.completed} / {progress.total}件完了
          </strong>
        </div>
        <progress
          max={Math.max(progress.total, 1)}
          value={progress.completed}
          aria-label={`作業 ${progress.completed}/${progress.total}件完了`}
        />
        <small>
          マイルストーン {achievedMilestones} / {activeMilestones.length}件達成
        </small>
      </section>

      <section
        className="mobile-action-board"
        aria-labelledby="mobile-action-title"
      >
        <div className="mobile-section-heading">
          <div>
            <span>優先順位を確認</span>
            <h3 id="mobile-action-title">やらないといけないこと</h3>
          </div>
          <span className="tag">
            {workItems.filter((item) => item.status !== "completed").length}件
          </span>
        </div>
        {groups.length ? (
          <div className="mobile-action-groups">
            {groups.map((group) => {
              const isExpanded = expanded.includes(group.id);
              return (
                <section
                  className={`mobile-action-group is-${group.id}`}
                  key={group.id}
                >
                  <button
                    type="button"
                    className="mobile-action-group-toggle"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpanded((current) =>
                        isExpanded
                          ? current.filter((id) => id !== group.id)
                          : [...current, group.id],
                      )
                    }
                  >
                    <span>
                      {group.id === "overdue" ? (
                        <AlertTriangle size={17} />
                      ) : (
                        <Clock3 size={17} />
                      )}
                      <strong>{group.label}</strong>
                      <small>{group.items.length}件</small>
                    </span>
                    <ChevronDown
                      size={18}
                      className={isExpanded ? "is-open" : ""}
                    />
                  </button>
                  {isExpanded && (
                    <ul className="mobile-action-list">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="mobile-action-main"
                            onClick={() => onEditWork(item)}
                          >
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {item.milestoneId
                                  ? (milestoneTitles.get(item.milestoneId) ??
                                    "未分類")
                                  : "未分類"}
                              </small>
                            </span>
                            <ChevronRight size={18} aria-hidden="true" />
                          </button>
                          <div className="mobile-action-row-footer">
                            <span
                              className={
                                group.id === "overdue" ? "overdue" : ""
                              }
                            >
                              {scheduleTiming(workSchedule(item), today)}
                            </span>
                            <ScheduleStatus
                              eventId={event.id}
                              target={{ kind: "work", item }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="mobile-action-empty">未完了の作業はありません。</p>
        )}
      </section>

      <div className="mobile-roadmap-heading">
        <span>全体の流れを確認</span>
        <h3>全体ロードマップ</h3>
      </div>
    </div>
  );
}
