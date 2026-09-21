const storageKey = "dance-note:show-finished-events";

export function readShowFinishedEvents(): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

export function saveShowFinishedEvents(show: boolean): void {
  try {
    localStorage.setItem(storageKey, String(show));
  } catch {
    // Filtering remains available when browser storage is disabled.
  }
}
