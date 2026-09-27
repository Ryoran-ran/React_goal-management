export function localDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}
export function weekOf(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay();
  const startDate = addDays(value, -((day + 6) % 7));
  return { startDate, endDate: addDays(startDate, 6) };
}
export function daysUntil(value: string, today = localDate()) {
  return Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );
}
export function countdownParts(value: string, today = localDate()) {
  const days = daysUntil(value, today);
  if (days === 0) return { primary: "今日" };
  if (days < 0) return { primary: String(-days), suffix: "日前" };
  if (days < 60) return { prefix: "あと", primary: String(days), suffix: "日" };

  const months = Math.max(2, Math.round(days / (365.2425 / 12)));
  return { primary: `約${months}か月`, detail: `あと${days}日` };
}
export function countdownLabel(value: string, today = localDate()) {
  const { prefix, primary, suffix, detail } = countdownParts(value, today);
  return `${prefix ?? ""}${primary}${suffix ?? ""}${detail ? `（${detail}）` : ""}`;
}
export function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
export function monthRange(month: string) {
  const last = new Date(`${month}-01T12:00:00`);
  last.setMonth(last.getMonth() + 1, 0);
  return { start: `${month}-01`, end: localDate(last) };
}
