import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  calendarWeekdays,
  readWeekStart,
  saveWeekStart,
} from "../lib/calendar";
import {
  readGoogleCalendarName,
  saveGoogleCalendarName,
} from "../lib/googleCalendarSettings";

export function CalendarSettings() {
  const [weekStart, setWeekStart] = useState(readWeekStart);
  const [googleCalendarName, setGoogleCalendarName] = useState(
    readGoogleCalendarName,
  );
  const [calendarNotice, setCalendarNotice] = useState("");

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
      <form
        className="google-calendar-settings"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          try {
            const saved = saveGoogleCalendarName(googleCalendarName);
            setGoogleCalendarName(saved);
            setCalendarNotice("初期登録先を保存しました。");
          } catch (cause) {
            setCalendarNotice(
              cause instanceof Error
                ? cause.message
                : "設定を保存できませんでした。",
            );
          }
        }}
      >
        <label className="field">
          <span>Googleカレンダーの初期登録先</span>
          <input
            required
            maxLength={200}
            value={googleCalendarName}
            onChange={(changeEvent) => {
              setGoogleCalendarName(changeEvent.target.value);
              setCalendarNotice("");
            }}
            placeholder="例：Dance Note、ダンス予定"
          />
        </label>
        <p className="muted">
          イベントからGoogleカレンダー登録を開いたときの初期値です。登録時に別の名前へ変更することもできます。
        </p>
        <button type="submit" className="secondary">
          初期登録先を保存
        </button>
        {calendarNotice && <p role="status">{calendarNotice}</p>}
      </form>
    </section>
  );
}
