const checks = new Set<() => boolean>();

export function registerUnsavedChanges(check: () => boolean): () => void {
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

export function hasUnsavedChanges(): boolean {
  return [...checks].some((check) => check());
}

export function confirmDiscardChanges(): boolean {
  return (
    !hasUnsavedChanges() ||
    window.confirm(
      "未保存の変更があります。保存せずに戻ると、入力内容や添付資料の変更は失われます。変更を破棄して移動しますか？",
    )
  );
}

export function draftHasChanges(
  initial: unknown,
  current: unknown,
  media?: { files: readonly unknown[]; removed: readonly string[] },
): boolean {
  return !!(
    media?.files.length ||
    media?.removed.length ||
    JSON.stringify(initial) !== JSON.stringify(current)
  );
}
