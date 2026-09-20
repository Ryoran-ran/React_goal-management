import { useState } from "react";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import type { LearningNote, LearningTheme } from "../types";
import { saveLearningNote } from "../data/learning";
import { remove } from "../data/repository";
import { youtubeLink } from "../lib/lessonContent";
import { Attachments, type ImageDraft } from "./Attachments";
import { Field, SaveForm } from "./ui";

export const noteKinds = {
  lesson: "教わったこと",
  practice: "練習して気づいたこと",
  reflection: "振り返り",
};
export function LearningNoteEditor({
  value,
  themes,
  exists,
  onClose,
  onSaved,
}: {
  value: LearningNote;
  themes: LearningTheme[];
  exists: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(value);
  const [media, setMedia] = useState<ImageDraft>({ files: [], removed: [] });
  const patch = (change: Partial<LearningNote>) =>
    setNote((old) => ({ ...old, ...change }));
  return (
    <section className="card editor learning-editor">
      <button type="button" className="text-button" onClick={onClose}>
        <ArrowLeft size={18} />
        戻る
      </button>
      <h1>
        {exists
          ? "記録を編集"
          : note.kind === "lesson"
            ? "レッスンの振り返り"
            : note.kind === "practice"
              ? "練習の振り返り"
              : "振り返りを記録"}
      </h1>
      <SaveForm
        onSave={async () => {
          await saveLearningNote(note, media.files, media.removed);
          onSaved();
        }}
        onCancel={onClose}
        saveLabel="記録を保存"
        onDelete={
          exists
            ? async () => {
                await remove("learningNotes", note.id);
                onSaved();
              }
            : undefined
        }
      >
        <div className="form-grid">
          <Field label="レッスン・練習をした日">
            <input
              type="date"
              required
              value={note.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
          <Field label="記録すること">
            <select
              value={note.kind}
              onChange={(e) =>
                patch({ kind: e.target.value as LearningNote["kind"] })
              }
            >
              {Object.entries(noteKinds).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="テーマ（後で選んでも大丈夫です）">
          <select
            value={note.themeId ?? ""}
            onChange={(e) => patch({ themeId: e.target.value || undefined })}
          >
            <option value="">テーマ未分類</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.category ? `${theme.category} · ` : ""}
                {theme.title}
                {theme.status !== "active" ? "（お休み・完了）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="教わったこと・気づいたこと">
          <textarea
            className="learning-memo"
            autoFocus
            value={note.memo}
            onChange={(e) => patch({ memo: e.target.value })}
            placeholder="レッスンや練習を振り返り、教わったことや自分の気づきを記入"
          />
        </Field>
        <Field label="次に試すこと（任意）">
          <textarea
            value={note.nextStep}
            onChange={(e) => patch({ nextStep: e.target.value })}
            placeholder="次の練習で意識したいことを、ひとつ。"
          />
        </Field>
        <details
          className="learning-optional"
          open={!!(value.attachmentIds.length || value.youtubeUrls.length)}
        >
          <summary>画像・動画・YouTubeを添える</summary>
          <Attachments
            type="learning"
            id={note.id}
            draft={media}
            onChange={setMedia}
          />
          <h3>YouTube</h3>
          {note.youtubeUrls.map((url, index) => (
            <div className="subform" key={index}>
              <Field label={`動画リンク ${index + 1}`}>
                <input
                  type="url"
                  value={url}
                  onChange={(e) =>
                    patch({
                      youtubeUrls: note.youtubeUrls.map((old, i) =>
                        i === index ? e.target.value : old,
                      ),
                    })
                  }
                  placeholder="https://www.youtube.com/watch?v=…"
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
                    動画を開く
                    <ExternalLink size={16} />
                  </a>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    patch({
                      youtubeUrls: note.youtubeUrls.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  リンクを外す
                </button>
              </div>
              {!!url.trim() && !youtubeLink(url) && (
                <p className="error">YouTubeの動画URLを入力してください。</p>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() => patch({ youtubeUrls: [...note.youtubeUrls, ""] })}
          >
            <Plus size={16} />
            リンクを追加
          </button>
        </details>
        {note.source && (
          <p className="muted">
            予定に紐づいた記録です。最初に保存すると、その予定は実施済みになります。
          </p>
        )}
      </SaveForm>
    </section>
  );
}
