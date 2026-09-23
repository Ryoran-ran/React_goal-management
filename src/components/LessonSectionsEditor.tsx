import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import type { LessonSection } from "../types";
import { lessonCategoryLabel, newLessonSection } from "../lib/lessonCategories";
import { useQuery } from "../lib/hooks";
import type { ImageDraft } from "./Attachments";
import { attachmentsFor } from "../data/repository";
import { parseLessonOutline } from "../lib/lessonOutline";

export function LessonSectionsEditor({
  lessonId,
  sections,
  onChange,
  media,
  onMediaChange,
  onOpenSection,
}: {
  lessonId: string;
  sections: LessonSection[];
  onChange: (sections: LessonSection[]) => void;
  media: ImageDraft;
  onMediaChange: (draft: ImageDraft) => void;
  onOpenSection: (id: string) => void;
}) {
  const { data: savedMedia = [] } = useQuery(
    () => attachmentsFor("lesson", lessonId),
    [lessonId],
  );
  return (
    <section
      className="lesson-sections lesson-form-section"
      aria-label="カテゴリ別のレッスン内容"
    >
      <header className="lesson-sections-heading">
        <h3>カテゴリ別のレッスン内容</h3>
        <button
          type="button"
          className="text-button"
          aria-label="レッスン内容を追加"
          onClick={() => {
            const section = newLessonSection();
            onChange([...sections, section]);
            onOpenSection(section.id);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          追加
        </button>
      </header>
      {sections.map((section) => {
        const label = lessonCategoryLabel(section) || "カテゴリ未選択";
        const summary = [
          { label: "内容", text: section.content },
          { label: "指摘", text: section.feedback },
          { label: "宿題", text: section.homework },
        ].find((field) => field.text.trim());
        const summaryText = summary
          ? `${summary.label}：${parseLessonOutline(summary.text)
              .map((item) => item.text)
              .join(" ／ ")}`
          : "";
        const mediaCount =
          savedMedia.filter(
            (item) =>
              item.sectionId === section.id && !media.removed.includes(item.id),
          ).length +
          media.files.filter(
            (_, index) => media.fileSectionIds?.[index] === section.id,
          ).length;
        const youtubeCount = section.youtubeUrls.filter((url) =>
          url.trim(),
        ).length;
        const mediaText = [
          mediaCount ? `画像・動画 ${mediaCount}件` : "",
          youtubeCount ? `YouTube ${youtubeCount}件` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="lesson-section-summary" key={section.id}>
            <button
              type="button"
              className="lesson-section-open"
              aria-label={`${label}のレッスン内容を開く`}
              onClick={() => onOpenSection(section.id)}
            >
              <span className="lesson-section-text">
                <strong>{label}</strong>
                {summaryText && (
                  <span className="muted lesson-section-excerpt">
                    {summaryText}
                  </span>
                )}
                {mediaText && <small className="muted">{mediaText}</small>}
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`${lessonCategoryLabel(section) || "カテゴリ未選択の記録"}の内容を削除`}
              onClick={() => {
                if (
                  !window.confirm(
                    "このカテゴリの内容と添付資料を削除しますか？ レッスンを保存すると反映されます。",
                  )
                )
                  return;
                onChange(sections.filter((item) => item.id !== section.id));
                onMediaChange({
                  ...media,
                  files: media.files.filter(
                    (_, i) => media.fileSectionIds?.[i] !== section.id,
                  ),
                  fileSectionIds: media.files
                    .map((_, i) => media.fileSectionIds?.[i])
                    .filter((id) => id !== section.id),
                });
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
