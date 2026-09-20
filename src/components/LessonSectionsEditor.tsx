import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import type { LessonSection } from "../types";
import { lessonCategoryLabel, newLessonSection } from "../lib/lessonCategories";
import { useQuery } from "../lib/hooks";
import type { ImageDraft } from "./Attachments";
import { attachmentsFor } from "../data/repository";

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
      <h3 className="lesson-section-title">カテゴリ別のレッスン内容</h3>
      <p className="muted lesson-edit-note">
        記録欄を追加し、開いた画面でカテゴリと内容・指摘・宿題を入力できます。
      </p>
      {sections.map((section) => (
        <section className="subform lesson-section-summary" key={section.id}>
          <header className="section-heading">
            <button
              type="button"
              className="text-button"
              onClick={() => onOpenSection(section.id)}
            >
              <strong>
                {lessonCategoryLabel(section) || "カテゴリ未選択"}
              </strong>
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
          </header>
          <p className="muted">
            内容：{section.content.trim() ? "記入済み" : "未記入"} · 指摘：
            {section.feedback.trim() ? "記入済み" : "未記入"} · 宿題：
            {section.homework.trim() ? "記入済み" : "未記入"}
          </p>
          <p className="clamp">
            {section.content ||
              section.feedback ||
              section.homework ||
              "カテゴリを開いて記録しましょう。"}
          </p>
          <p className="muted">
            画像・動画{" "}
            {savedMedia.filter(
              (item) =>
                item.sectionId === section.id &&
                !media.removed.includes(item.id),
            ).length +
              media.files.filter(
                (_, index) => media.fileSectionIds?.[index] === section.id,
              ).length}
            件 · YouTube{" "}
            {section.youtubeUrls.filter((url) => url.trim()).length}件
          </p>
        </section>
      ))}
      <div className="focus-create-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const section = newLessonSection();
            onChange([...sections, section]);
            onOpenSection(section.id);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          レッスン内容を追加
        </button>
      </div>
    </section>
  );
}
