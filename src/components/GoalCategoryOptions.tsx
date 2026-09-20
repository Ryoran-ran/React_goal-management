import {
  goalCategories,
  latinCategories,
  standardCategories,
} from "../lib/goalCategories";

export function GoalCategoryOptions({ filter = false }: { filter?: boolean }) {
  return (
    <>
      {filter && <option value="all">すべてのカテゴリ</option>}
      <option value="general">全体</option>
      <option value="latin">
        {filter ? "ラテン（各種目を含む）" : "ラテン"}
      </option>
      <option value="standard">
        {filter ? "モダン（各種目を含む）" : "モダン"}
      </option>
      <optgroup label="ラテンの種目">
        {latinCategories.map((category) => (
          <option key={category} value={category}>
            {goalCategories[category]}
          </option>
        ))}
      </optgroup>
      <optgroup label="モダンの種目">
        {standardCategories.map((category) => (
          <option key={category} value={category}>
            {goalCategories[category]}
          </option>
        ))}
      </optgroup>
    </>
  );
}
