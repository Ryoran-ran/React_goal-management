import { useEffect, useState } from "react";
import { ImagePlus, Image as ImageIcon, Video } from "lucide-react";
import { attachmentBlob, attachmentsFor } from "../data/repository";
import { useQuery, errorText } from "../lib/hooks";
import type { Attachment } from "../types";
export interface ImageDraft {
  files: File[];
  removed: string[];
  fileSectionIds?: (string | undefined)[];
}
export function Attachments({
  type,
  id,
  draft,
  onChange,
  sectionId,
}: {
  type: Attachment["relatedType"];
  id: string;
  draft: ImageDraft;
  onChange: (draft: ImageDraft) => void;
  sectionId?: string;
}) {
  const { data, error } = useQuery(() => attachmentsFor(type, id), [type, id]);
  const [opened, setOpened] = useState<{
    url: string;
    mimeType: string;
    name: string;
  }>();
  const allowVideo = type === "lesson" || type === "learning";
  const [imageError, setImageError] = useState("");
  useEffect(
    () => () => {
      if (opened) URL.revokeObjectURL(opened.url);
    },
    [opened],
  );
  async function open(attachment: Attachment) {
    try {
      setImageError("");
      const blob = await attachmentBlob(attachment.id);
      if (blob)
        setOpened({
          url: URL.createObjectURL(blob),
          mimeType: attachment.mimeType,
          name: attachment.name,
        });
      else setImageError("資料が見つかりません。");
    } catch (e) {
      setImageError(errorText(e));
    }
  }
  return (
    <div className="attachments">
      <span className="field-title">
        {allowVideo ? "画像・動画資料" : "画像資料"}
      </span>
      <label className="upload">
        <ImagePlus size={20} />
        <span>{allowVideo ? "画像・動画を追加" : "画像を追加"}</span>
        <input
          type="file"
          accept={`image/jpeg,image/png,image/webp,image/gif${allowVideo ? ",video/mp4,video/webm,video/quicktime,.mov" : ""}`}
          multiple
          onChange={(e) => {
            onChange({
              ...draft,
              files: [...draft.files, ...Array.from(e.target.files ?? [])],
              fileSectionIds: [
                ...draft.files.map((_, i) => draft.fileSectionIds?.[i]),
                ...Array.from(e.target.files ?? []).map(() => sectionId),
              ],
            });
            e.target.value = "";
          }}
        />
      </label>
      {data
        ?.filter(
          (a) => !draft.removed.includes(a.id) && a.sectionId === sectionId,
        )
        .map((a) => (
          <div className="file-row" key={a.id}>
            <button
              type="button"
              className="text-button"
              onClick={() => void open(a)}
            >
              {a.mimeType.startsWith("video/") ? (
                <Video size={16} />
              ) : (
                <ImageIcon size={16} />
              )}
              {a.name}
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                onChange({ ...draft, removed: [...draft.removed, a.id] })
              }
            >
              削除
            </button>
          </div>
        ))}
      {draft.files.map((f, i) =>
        draft.fileSectionIds?.[i] === sectionId ? (
          <div className="file-row" key={i}>
            <span>
              {f.name} <small>未保存</small>
            </span>
            <button
              className="text-button danger"
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  files: draft.files.filter((_, j) => i !== j),
                  fileSectionIds: draft.files
                    .map((_, j) => draft.fileSectionIds?.[j])
                    .filter((_, j) => i !== j),
                })
              }
            >
              取り消す
            </button>
          </div>
        ) : null,
      )}
      {(error || imageError) && (
        <p role="alert" className="error">
          {error || imageError}
        </p>
      )}
      {opened && (
        <div className="image-detail">
          <button
            type="button"
            className="secondary"
            onClick={() => setOpened(undefined)}
          >
            資料を閉じる
          </button>
          {opened.mimeType.startsWith("video/") ? (
            <>
              <video
                src={opened.url}
                controls
                playsInline
                preload="metadata"
                onError={() =>
                  setImageError(
                    "このブラウザでは動画を再生できません。保存して端末のプレーヤーで開けます。",
                  )
                }
              />
              <a
                href={opened.url}
                download={opened.name}
                className="text-button"
              >
                動画を端末に保存
              </a>
            </>
          ) : (
            <img src={opened.url} alt={opened.name} />
          )}
        </div>
      )}
    </div>
  );
}
