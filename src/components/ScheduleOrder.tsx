import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { EventMilestone, EventWorkItem } from "../types";
import { reorderSchedule } from "../data/scheduleOrder";

export function ScheduleOrder({
  eventId,
  kind,
  item,
  previous,
  next,
}: {
  eventId: string;
  kind: "milestone" | "work";
  item: EventMilestone | EventWorkItem;
  previous?: EventMilestone | EventWorkItem;
  next?: EventMilestone | EventWorkItem;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const move = async (neighbor: EventMilestone | EventWorkItem) => {
    setBusy(true);
    setError("");
    try {
      await reorderSchedule(
        eventId,
        kind,
        item.id,
        neighbor.id,
        item.updatedAt,
        neighbor.updatedAt,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "並べ替えできませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!previous && !next) return null;
  return (
    <div className="schedule-order">
      <div role="group" aria-label={`${item.title}の同日内の並び順`}>
        <button
          type="button"
          className="icon-button"
          disabled={busy || !previous}
          onClick={() => previous && move(previous)}
          title="同じ日付の中で上へ"
          aria-label={`${item.title}を同じ日付の中で上へ`}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={busy || !next}
          onClick={() => next && move(next)}
          title="同じ日付の中で下へ"
          aria-label={`${item.title}を同じ日付の中で下へ`}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
