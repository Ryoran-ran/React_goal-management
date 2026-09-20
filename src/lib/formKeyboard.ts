import type { KeyboardEvent } from "react";

export function handleFormKeyDown(
  event: KeyboardEvent<HTMLFormElement>,
  busy: boolean,
) {
  if (
    event.key !== "Enter" ||
    event.nativeEvent.isComposing ||
    event.keyCode === 229
  )
    return;
  if (event.ctrlKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    // Handle the shortcut before a child input can treat Enter as "add item".
    event.stopPropagation();
    if (!busy && !event.repeat) event.currentTarget.requestSubmit();
    return;
  }
  const target = event.target as HTMLElement;
  const input = target as HTMLInputElement;
  if (
    (target.tagName === "INPUT" &&
      !["button", "reset", "file"].includes(input.type)) ||
    (target.tagName === "BUTTON" &&
      (target as HTMLButtonElement).type === "submit")
  )
    event.preventDefault();
}
