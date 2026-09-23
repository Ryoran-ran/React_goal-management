export type AgendaView = "month" | "week" | "day";
const storageKey = "dance-note:agenda-view";

export function readAgendaView(): AgendaView {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === "day" || saved === "week" ? saved : "month";
  } catch {
    return "month";
  }
}

export function saveAgendaView(view: AgendaView): void {
  try {
    localStorage.setItem(storageKey, view);
  } catch {
    // The view can still change when browser storage is unavailable.
  }
}
