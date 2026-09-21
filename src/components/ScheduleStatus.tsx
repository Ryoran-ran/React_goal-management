import { useState } from "react";
import type { EventMilestone, EventWorkItem } from "../types";
import { workStatuses, withWorkStatus } from "../lib/eventWork";
import { milestoneStatuses } from "../lib/milestones";
import { saveEventWork } from "../data/eventWork";
import { saveEventMilestone } from "../data/eventMilestones";

type Target =
  | { kind: "work"; item: EventWorkItem }
  | { kind: "milestone"; item: EventMilestone };

export function ScheduleStatus({
  eventId,
  target,
}: {
  eventId: string;
  target: Target;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const statuses = target.kind === "work" ? workStatuses : milestoneStatuses;
  return (
    <div className="schedule-status">
      <select
        aria-label={`${target.item.title}の状態`}
        value={target.item.status}
        disabled={busy}
        onChange={async (e) => {
          const status = e.target.value;
          setBusy(true);
          setError("");
          try {
            if (target.kind === "work") {
              await saveEventWork(
                eventId,
                withWorkStatus(target.item, status as EventWorkItem["status"]),
                "",
                true,
              );
            } else {
              await saveEventMilestone(
                eventId,
                { ...target.item, status: status as EventMilestone["status"] },
                "",
                true,
              );
            }
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "状態を保存できませんでした。",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {Object.entries(statuses).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
