export type AgendaView = "month" | "day";
const storageKey = "dance-note:agenda-view";

export function readAgendaView(): AgendaView {
  try {
    return localStorage.getItem(storageKey) === "day" ? "day" : "month";
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
