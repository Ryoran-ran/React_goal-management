import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmDiscardChanges,
  draftHasChanges,
  hasUnsavedChanges,
  registerUnsavedChanges,
} from "./unsavedChanges";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe("unsaved editing changes", () => {
  it("recognizes nested lesson edits, pending categories, links and media", () => {
    const initial = {
      sections: [{ id: "rumba", feedback: "・目線", youtubeUrls: [] }],
    };
    expect(draftHasChanges(initial, structuredClone(initial))).toBe(false);
    expect(
      draftHasChanges(initial, {
        sections: [{ ...initial.sections[0], feedback: "・目線\n  下げない" }],
      }),
    ).toBe(true);
    expect(
      draftHasChanges(initial, {
        sections: [
          ...initial.sections,
          { id: "new", feedback: "", youtubeUrls: [] },
        ],
      }),
    ).toBe(true);
    expect(
      draftHasChanges(initial, {
        sections: [{ ...initial.sections[0], youtubeUrls: [""] }],
      }),
    ).toBe(true);
    expect(
      draftHasChanges(initial, initial, {
        files: [new Blob(["photo"])],
        removed: [],
      }),
    ).toBe(true);
    expect(
      draftHasChanges(initial, initial, { files: [], removed: ["photo"] }),
    ).toBe(true);
    expect(draftHasChanges(initial, initial, { files: [], removed: [] })).toBe(
      false,
    );
  });

  it("allows an unchanged or reverted draft to leave without a warning", () => {
    const confirm = vi.fn();
    vi.stubGlobal("window", { confirm });
    let current = "元の内容";
    cleanup.push(registerUnsavedChanges(() => current !== "元の内容"));
    expect(confirmDiscardChanges()).toBe(true);
    current = "変更した内容";
    expect(hasUnsavedChanges()).toBe(true);
    current = "元の内容";
    expect(confirmDiscardChanges()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps all drafts when cancelled and permits leaving only after confirmation", () => {
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal("window", { confirm });
    cleanup.push(registerUnsavedChanges(() => true));
    cleanup.push(registerUnsavedChanges(() => true));
    expect(confirmDiscardChanges()).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirmDiscardChanges()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("removes the warning after the editor unmounts on save or close", () => {
    const confirm = vi.fn();
    vi.stubGlobal("window", { confirm });
    const unregister = registerUnsavedChanges(() => true);
    cleanup.push(unregister);
    expect(hasUnsavedChanges()).toBe(true);
    unregister();
    expect(confirmDiscardChanges()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
