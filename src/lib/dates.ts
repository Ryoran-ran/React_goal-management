export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
export function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
export function monthRange(month: string) {
  const [year, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: localDate(new Date(year, m, 0)) };
}
