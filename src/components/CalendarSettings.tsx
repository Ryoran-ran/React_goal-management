import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  calendarWeekdays,
  readWeekStart,
  saveWeekStart,
} from "../lib/calendar";

export function CalendarSettings() {
  const [weekStart, setWeekStart] = useState(readWeekStart);

  return (
    <section className="card" aria-labelledby="calendar-settings-title">
      <div className="section-heading">
        <h2 id="calendar-settings-title">
          <CalendarDays size={24} aria-hidden="true" />
          カレンダー設定
        </h2>
      </div>
      <label className="calendar-week-start">
        <span>週の開始曜日</span>
        <select
          value={weekStart}
          onChange={(event) => {
            const next = Number(event.target.value);
            setWeekStart(next);
            saveWeekStart(next);
          }}
        >
          {calendarWeekdays.map((day, index) => (
            <option key={day} value={index}>
              {day}曜日
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
