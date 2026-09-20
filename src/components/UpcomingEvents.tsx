import { ArrowUpRight, Flag } from "lucide-react";
import type { DanceEvent } from "../types";
import { dateLabel, daysUntil } from "../lib/dates";
import { eventTypes } from "../pages/Events";

export function UpcomingEvents({
  events,
  today,
  onManage,
}: {
  events: DanceEvent[];
  today: string;
  onManage: () => void;
}) {
  return (
    <section className="next-event">
      <div className="section-heading">
        <h2>
          <Flag size={20} />
          今後のイベント
        </h2>
        <span className="event-type">{events.length}件</span>
      </div>
      {events.length > 0 ? (
        <ul className="stage-event-list" aria-label="今後のイベント一覧">
          {events.map((event) => {
            const sameDayCount = events.filter(
              (other) => other.date === event.date,
            ).length;
            const remaining = daysUntil(event.date, today);
            return (
              <li className="stage-event-row" key={event.id}>
                <div className="stage-event-info">
                  <span className="event-type">{eventTypes[event.type]}</span>
                  <h3>{event.title}</h3>
                  <time dateTime={event.date}>
                    {event.date.slice(0, 4)}年{dateLabel(event.date)}
                  </time>
                  {sameDayCount > 1 && (
                    <span className="stage-same-day">
                      同じ日に{sameDayCount}件
                    </span>
                  )}
                </div>
                <span className="stage-event-count">
                  {remaining === 0 ? (
                    <strong>今日</strong>
                  ) : (
                    <>
                      あと <strong>{remaining}</strong> 日
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>競技会やメダルテストを登録すると、日付順にここで確認できます。</p>
      )}
      <button className="light-link" onClick={onManage}>
        イベント一覧を見る
        <ArrowUpRight size={17} />
      </button>
    </section>
  );
}
