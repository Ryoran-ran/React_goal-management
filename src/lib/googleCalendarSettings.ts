export const defaultGoogleCalendarName = "Dance Note";
const calendarNameStorageKey = "dance-note:google-calendar-name";

export function readGoogleCalendarName() {
  try {
    const value = localStorage.getItem(calendarNameStorageKey)?.trim();
    return value && value.length <= 200 ? value : defaultGoogleCalendarName;
  } catch {
    return defaultGoogleCalendarName;
  }
}

export function saveGoogleCalendarName(value: string) {
  const next = value.trim();
  if (!next || next.length > 200)
    throw new Error("カレンダー名は200文字以内で入力してください。");
  try {
    localStorage.setItem(calendarNameStorageKey, next);
  } catch {
    throw new Error("このブラウザでは設定を保存できませんでした。");
  }
  return next;
}
