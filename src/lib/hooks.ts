import { useEffect, useState } from "react";
import { watch } from "../data/repository";
export function errorText(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError")
      return "端末の保存容量が不足しています。画像の数やサイズを減らして再度保存してください。";
    if (error.name === "ConstraintError")
      return "この日付・期間にはすでに記録があります。一覧から既存の記録を開いて編集してください。";
    return error.message;
  }
  return "保存できませんでした。もう一度お試しください。";
}
export function useQuery<T>(
  query: () => Promise<T>,
  dependencies: unknown[] = [],
  prepare?: () => Promise<unknown>,
) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    setState({});
    const subscription = watch(
      query,
      (data) => setState({ data }),
      (error) => setState({ error: errorText(error) }),
      prepare,
    );
    return () => subscription.unsubscribe();
  }, dependencies); // Queries are recreated only when their explicit keys change.
  return state;
}
