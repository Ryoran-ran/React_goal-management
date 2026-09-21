import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { handleFormKeyDown } from "./formKeyboard";

function key(overrides: Record<string, unknown> = {}) {
  return {
    key: "Enter",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    keyCode: 13,
    nativeEvent: { isComposing: false },
    target: { tagName: "INPUT", type: "text" },
    currentTarget: { requestSubmit: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent<HTMLFormElement>;
}

describe("form save keyboard controls", () => {
  it("does not save the enclosing form from a calendar portal", () => {
    const event = key({
      ctrlKey: true,
      target: { tagName: "BUTTON", type: "button", closest: () => ({}) },
    });
    handleFormKeyDown(event, false);
    expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it("prevents Enter submission while preserving textarea newlines and other buttons", () => {
    for (const target of [
      { tagName: "INPUT", type: "text" },
      { tagName: "INPUT", type: "number" },
      { tagName: "BUTTON", type: "submit" },
    ]) {
      const event = key({ target });
      handleFormKeyDown(event, false);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
    }
    for (const target of [
      { tagName: "TEXTAREA" },
      { tagName: "BUTTON", type: "button" },
      { tagName: "SELECT" },
    ]) {
      const event = key({ target });
      handleFormKeyDown(event, false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
    }
  });
  it("uses native validated submission for Ctrl+Enter, before child Enter handlers", () => {
    for (const tagName of ["INPUT", "TEXTAREA"]) {
      const event = key({ ctrlKey: true, target: { tagName, type: "text" } });
      handleFormKeyDown(event, false);
      expect(event.currentTarget.requestSubmit).toHaveBeenCalledOnce();
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    }
  });
  it("does not save during IME composition, key repeat, or an active save", () => {
    for (const override of [
      { nativeEvent: { isComposing: true } },
      { keyCode: 229 },
      { repeat: true },
    ]) {
      const event = key({ ctrlKey: true, ...override });
      handleFormKeyDown(event, false);
      expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
    }
    const busy = key({ ctrlKey: true });
    handleFormKeyDown(busy, true);
    expect(busy.currentTarget.requestSubmit).not.toHaveBeenCalled();
    const composing = key({ nativeEvent: { isComposing: true } });
    handleFormKeyDown(composing, false);
    expect(composing.preventDefault).not.toHaveBeenCalled();
  });
});
