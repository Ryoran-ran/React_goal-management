import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { addDays, localDate, monthRange } from "../lib/dates";
import {
  calendarDays,
  calendarValueLabel,
  calendarWeekdays,
  dateAllowed,
  monthAllowed,
  readWeekStart,
  shiftCalendarMonth,
} from "../lib/calendar";
import {
  calendarLessons,
  type CalendarLessonCounts,
} from "../data/calendarLessons";
import { useQuery } from "../lib/hooks";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  type: "date" | "month";
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  allowClear?: boolean;
};

export function DatePicker({
  type,
  value,
  onChange,
  min,
  max,
  allowClear = false,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  useEffect(() => {
    input.current?.setCustomValidity(
      value && !dateAllowed(value, min, max)
        ? "指定できる期間内の日付を選んでください。"
        : "",
    );
  }, [value, min, max]);
  const close = () => {
    setOpen(false);
    input.current?.focus();
  };
  return (
    <span className="date-picker-field">
      <input
        {...props}
        ref={input}
        type="text"
        value={calendarValueLabel(value, type)}
        className={`date-picker-trigger ${props.className ?? ""}`}
        inputMode="none"
        autoComplete="off"
        placeholder={type === "month" ? "月を選択" : "日付を選択"}
        role="combobox"
        aria-readonly="true"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        onChange={() => {}}
        onPaste={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
        onInvalid={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          } else if (
            event.key.length === 1 ||
            ["Backspace", "Delete"].includes(event.key)
          )
            event.preventDefault();
        }}
      />
      <CalendarDays className="date-picker-icon" size={18} aria-hidden="true" />
      {open &&
        createPortal(
          <CalendarDialog
            id={dialogId}
            type={type}
            value={value}
            min={min}
            max={max}
            allowClear={allowClear && !props.required}
            title={
              props["aria-label"] ||
              (type === "month" ? "月を選択" : "日付を選択")
            }
            onSelect={(date) => {
              onChange(date);
              close();
            }}
            onClose={close}
          />,
          document.body,
        )}
    </span>
  );
}

function CalendarDialog({
  id,
  type,
  value,
  min,
  max,
  allowClear,
  title,
  onSelect,
  onClose,
}: {
  id: string;
  type: "date" | "month";
  value: string;
  min?: string;
  max?: string;
  allowClear: boolean;
  title: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const today = localDate();
  const initial =
    value || (min && today < min ? min : max && today > max ? max : today);
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [view, setView] = useState<"day" | "month" | "year">(
    type === "month" ? "month" : "day",
  );
  const [weekStart] = useState(readWeekStart);
  const [focusedDate, setFocusedDate] = useState(
    initial.length === 10 ? initial : `${month}-01`,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const focusPending = useRef(true);
  const titleId = `${id}-title`;
  const days = calendarDays(month, weekStart);
  const supportedDays = days.filter((date) => dateAllowed(date));
  const start = supportedDays[0],
    end = supportedDays[supportedDays.length - 1];
  const lessons = useQuery(
    () =>
      view === "day"
        ? calendarLessons(start, end)
        : Promise.resolve({} as CalendarLessonCounts),
    [start, end, view],
  );
  const year = Number(month.slice(0, 4));
  const yearStart = Math.max(1, Math.floor(year / 12) * 12);
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i).filter(
    (candidate) => candidate <= 9999,
  );
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    if (!focusPending.current) return;
    const target =
      dialog.current?.querySelector<HTMLButtonElement>(
        `[data-date="${focusedDate}"]:not(:disabled), [data-month="${month}"]:not(:disabled)`,
      ) ??
      dialog.current?.querySelector<HTMLButtonElement>(
        '.calendar-days button[tabindex="0"], .calendar-month-grid button:not(:disabled)',
      );
    if (target) {
      target.focus();
      focusPending.current = false;
    }
  }, [focusedDate, month, view]);
  const choose = (date: string) => {
    if (dateAllowed(date, min, max)) onSelect(date);
  };
  const navigate = (offset: number) => {
    const next = shiftCalendarMonth(
      month,
      offset * (view === "day" ? 1 : view === "month" ? 12 : 144),
    );
    if (/^\d{4}-\d{2}$/.test(next) && next >= "0001-01") setMonth(next);
  };
  const dayKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    date: string,
  ) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const index = (new Date(`${date}T12:00:00`).getDay() - weekStart + 7) % 7;
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -index,
      End: 6 - index,
    };
    let next: string;
    if (event.key in deltas) next = addDays(date, deltas[event.key]);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const nextMonth = shiftCalendarMonth(
        date.slice(0, 7),
        event.key === "PageUp" ? -1 : 1,
      );
      next = `${nextMonth}-${String(Math.min(Number(date.slice(8)), Number(monthRange(nextMonth).end.slice(8)))).padStart(2, "0")}`;
    } else return;
    event.preventDefault();
    if (!dateAllowed(next, min, max)) return;
    focusPending.current = true;
    setFocusedDate(next);
    setMonth(next.slice(0, 7));
  };
  const activeDay =
    days.includes(focusedDate) &&
    focusedDate.slice(0, 7) === month &&
    dateAllowed(focusedDate, min, max)
      ? focusedDate
      : days.find(
          (date) => date.startsWith(month) && dateAllowed(date, min, max),
        );
  return (
    <dialog
      ref={dialog}
      id={id}
      className="app-calendar"
      aria-labelledby={titleId}
      data-calendar-dialog
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="calendar-content">
        <header className="calendar-title">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="カレンダーを閉じる"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="calendar-month-nav">
          <button
            type="button"
            className="icon-button"
            aria-label={
              view === "day"
                ? "前の月"
                : view === "month"
                  ? "前の年"
                  : "前の12年"
            }
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          {view === "year" ? (
            <strong aria-live="polite">
              {years[0]}〜{years.at(-1)}年
            </strong>
          ) : (
            <button
              type="button"
              className="calendar-period"
              aria-label={view === "day" ? "月を選ぶ" : "年を選ぶ"}
              onClick={() => {
                setView(view === "day" ? "month" : "year");
                focusPending.current = true;
              }}
            >
              {year}年{view === "day" ? ` ${Number(month.slice(5))}月` : ""}{" "}
              <span aria-hidden="true">▾</span>
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={
              view === "day"
                ? "次の月"
                : view === "month"
                  ? "次の年"
                  : "次の12年"
            }
            onClick={() => navigate(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        {view === "day" && (
          <>
            <div className="calendar-weekdays" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7).map(
                (day) => (
                  <span
                    key={day}
                    className={
                      day === 0
                        ? "calendar-sunday"
                        : day === 6
                          ? "calendar-saturday"
                          : ""
                    }
                  >
                    {calendarWeekdays[day]}
                  </span>
                ),
              )}
            </div>
            <div
              className="calendar-days"
              role="group"
              aria-label={`${year}年${Number(month.slice(5))}月の日付`}
            >
              {days.map((date) => {
                const weekday = new Date(`${date}T12:00:00`).getDay();
                const count = lessons.data?.[date]?.active ?? 0;
                const cancelled = lessons.data?.[date]?.cancelled ?? 0;
                return (
                  <button
                    type="button"
                    key={date}
                    data-date={date}
                    tabIndex={date === activeDay ? 0 : -1}
                    disabled={!dateAllowed(date, min, max)}
                    aria-pressed={date === value}
                    aria-current={date === today ? "date" : undefined}
                    aria-label={`${calendarValueLabel(date, "date")}${count ? `、レッスン${count}件` : ""}${cancelled ? `、中止のレッスン${cancelled}件` : ""}${date === today ? "、今日" : ""}`}
                    className={`calendar-day ${weekday === 0 ? "calendar-sunday" : weekday === 6 ? "calendar-saturday" : ""} ${date.slice(0, 7) !== month ? "is-outside" : ""} ${count ? "has-lessons" : ""} ${cancelled ? "has-cancellations" : ""} ${date === value ? "is-selected" : ""} ${date === today ? "is-today" : ""}`}
                    onKeyDown={(event) => dayKeyboard(event, date)}
                    onFocus={() => setFocusedDate(date)}
                    onClick={() => choose(date)}
                  >
                    <span>{Number(date.slice(8))}</span>
                    {count > 0 && (
                      <span
                        className="calendar-lesson-dot"
                        aria-hidden="true"
                      />
                    )}
                    {cancelled > 0 && (
                      <span
                        className="calendar-cancelled-label"
                        aria-hidden="true"
                      >
                        中止
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="calendar-legend">
              <span>
                <i />
                レッスンあり
              </span>
              <span className="calendar-cancelled-legend">
                中止：レッスン中止
              </span>
              <span className="calendar-saturday">土曜</span>
              <span className="calendar-sunday">日曜</span>
            </div>
            {lessons.error ? (
              <p className="error" role="alert">
                レッスンの予定を読み込めませんでした。日付は選択できます。
              </p>
            ) : (
              !lessons.data && (
                <p className="muted" role="status">
                  レッスンの予定を確認中…
                </p>
              )
            )}
          </>
        )}
        {view === "month" && (
          <div
            className="calendar-month-grid"
            role="group"
            aria-label="月を選択"
          >
            {Array.from({ length: 12 }, (_, index) => {
              const candidate = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
              const enabled =
                type === "month"
                  ? dateAllowed(candidate, min, max)
                  : monthAllowed(candidate, min, max);
              return (
                <button
                  type="button"
                  key={candidate}
                  data-month={candidate}
                  disabled={!enabled}
                  aria-pressed={value.slice(0, 7) === candidate}
                  onClick={() => {
                    if (type === "month") choose(candidate);
                    else {
                      setMonth(candidate);
                      setFocusedDate(`${candidate}-01`);
                      setView("day");
                      focusPending.current = true;
                    }
                  }}
                >
                  {index + 1}月
                </button>
              );
            })}
          </div>
        )}
        {view === "year" && (
          <div
            className="calendar-month-grid"
            role="group"
            aria-label="年を選択"
          >
            {years.map((candidate) => (
              <button
                type="button"
                key={candidate}
                onClick={() => {
                  setMonth(
                    `${String(candidate).padStart(4, "0")}-${month.slice(5)}`,
                  );
                  setView("month");
                  focusPending.current = true;
                }}
              >
                {candidate}年
              </button>
            ))}
          </div>
        )}
        <footer className="calendar-footer">
          {allowClear && (
            <button
              type="button"
              className="text-button"
              onClick={() => onSelect("")}
            >
              未設定にする
            </button>
          )}
          <button
            type="button"
            className="secondary"
            disabled={
              !dateAllowed(
                type === "month" ? today.slice(0, 7) : today,
                min,
                max,
              )
            }
            onClick={() => choose(type === "month" ? today.slice(0, 7) : today)}
          >
            {type === "month" ? "今月を選ぶ" : "今日を選ぶ"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
