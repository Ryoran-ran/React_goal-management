import { useState } from "react";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import type { LessonSection } from "../types";
import {
  categoryNameKey,
  lessonCategoryFromValue,
  lessonCategoryKey,
  lessonCategoryLabel,
  lessonCategoryValue,
} from "../lib/lessonCategories";
import { customLessonCategories } from "../data/lessonCategories";
import { useQuery } from "../lib/hooks";
import { youtubeLink } from "../lib/lessonContent";
import { handleFormKeyDown } from "../lib/formKeyboard";
import { Attachments, type ImageDraft } from "./Attachments";
import { GoalCategoryOptions } from "./GoalCategoryOptions";
import { Field } from "./ui";

export function LessonSectionScreen({
  lessonId,
  section,
  sections,
  onChange,
  media,
  onMediaChange,
  onBack,
}: {
  lessonId: string;
  section: LessonSection;
  sections: LessonSection[];
  onChange: (section: LessonSection) => void;
  media: ImageDraft;
  onMediaChange: (draft: ImageDraft) => void;
  onBack: () => void;
}) {
  const { data: savedCategories = [], error: savedCategoryError } = useQuery(
    customLessonCategories,
  );
  const [addingCategory, setAddingCategory] = useState(false);
  const customNames = [
    ...new Map(
      [
        ...savedCategories,
        ...sections
          .filter(
            (item) => item.category === "custom" && item.customCategory?.trim(),
          )
          .map((item) => item.customCategory!),
      ].map((name) => [categoryNameKey(name), name]),
    ).values(),
  ];
  const customOptions = (
    <optgroup label="追加したカテゴリ">
      {customNames.map((name) => (
        <option key={name} value={`custom:${name}`}>
          {name}
        </option>
      ))}
    </optgroup>
  );
  const categoryError =
    lessonCategoryLabel(section) &&
    sections.some(
      (item) =>
        item.id !== section.id &&
        lessonCategoryKey(item) === lessonCategoryKey(section),
    )
      ? "このカテゴリは追加済みです。別のカテゴリを選ぶか、一覧の同じカテゴリに追記してください。"
      : "";
  const update = (_id: string, change: Partial<LessonSection>) => {
    onChange({ ...section, ...change });
  };
  return (
    <section className="editor card">
      <header className="goal-selection-header">
        <button type="button" className="text-button" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          戻る
        </button>
        <h2>
          {lessonCategoryLabel(section)
            ? `${lessonCategoryLabel(section)}のレッスン内容`
            : "レッスン内容を追加"}
        </h2>
      </header>
      <p className="muted">
        カテゴリを選び、内容・指摘・宿題を記録します。「戻る」で入力を保持して戻り、レッスン画面で保存できます。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onBack();
        }}
        onKeyDownCapture={(event) => handleFormKeyDown(event, false)}
      >
        {categoryError && (
          <p className="error" role="alert">
            {categoryError}
          </p>
        )}
        <Field label="カテゴリ">
          <select
            autoFocus
            value={addingCategory ? "new" : lessonCategoryValue(section)}
            onChange={(e) => {
              const isNew = e.target.value === "new";
              setAddingCategory(isNew);
              update(
                section.id,
                lessonCategoryFromValue(isNew ? "" : e.target.value),
              );
            }}
          >
            <option value="">カテゴリを選択</option>
            <option value="new">＋ 新しいカテゴリを追加</option>
            <GoalCategoryOptions />
            {customOptions}
          </select>
        </Field>
        {addingCategory && (
          <Field label="新しいカテゴリ名">
            <input
              autoFocus
              maxLength={80}
              value={section.customCategory ?? ""}
              placeholder="例：ストレッチ、サルサ、表現"
              onChange={(event) =>
                update(section.id, {
                  category: "custom",
                  customCategory: event.target.value,
                })
              }
            />
          </Field>
        )}
        {savedCategoryError && (
          <p className="error" role="alert">
            カテゴリを読み込めませんでした：{savedCategoryError}
          </p>
        )}
        <Field label="取り組んだ内容">
          <textarea
            value={section.content}
            onChange={(e) => update(section.id, { content: e.target.value })}
            placeholder="練習したフィガー・動きなど"
          />
        </Field>
        <Field label="先生からの指摘・アドバイス">
          <textarea
            value={section.feedback}
            onChange={(e) => update(section.id, { feedback: e.target.value })}
          />
        </Field>
        <Field label="次回までの宿題">
          <textarea
            value={section.homework}
            onChange={(e) => update(section.id, { homework: e.target.value })}
          />
        </Field>
        <Attachments
          type="lesson"
          id={lessonId}
          sectionId={section.id}
          draft={media}
          onChange={onMediaChange}
        />
        <div className="lesson-youtube">
          <h4>YouTubeの動画</h4>
          {section.youtubeUrls.map((url, i) => (
            <div className="subform" key={i}>
              <Field label={`YouTube URL ${i + 1}`}>
                <input
                  type="url"
                  value={url}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) =>
                    update(section.id, {
                      youtubeUrls: section.youtubeUrls.map((old, j) =>
                        j === i ? e.target.value : old,
                      ),
                    })
                  }
                />
              </Field>
              <div className="focus-create-actions">
                {youtubeLink(url) && (
                  <a
                    className="text-button"
                    href={youtubeLink(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    YouTubeで開く <ExternalLink size={16} />
                  </a>
                )}
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    update(section.id, {
                      youtubeUrls: section.youtubeUrls.filter(
                        (_, j) => i !== j,
                      ),
                    })
                  }
                >
                  リンクを削除
                </button>
              </div>
              {url.trim() && !youtubeLink(url) && (
                <p className="error">YouTubeの動画URLを入力してください。</p>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              update(section.id, {
                youtubeUrls: [...section.youtubeUrls, ""],
              })
            }
          >
            <Plus size={16} />
            YouTubeリンクを追加
          </button>
        </div>
        <footer className="form-actions">
          <div className="spacer" />
          <button
            type="submit"
            className="primary"
            aria-keyshortcuts="Control+Enter"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            戻る
          </button>
        </footer>
      </form>
    </section>
  );
}
