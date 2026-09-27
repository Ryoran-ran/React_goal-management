import { useEffect, useState } from "react";
import { Image as ImageIcon, Video } from "lucide-react";
import type { Attachment } from "../types";
import { attachmentBlob, attachmentsFor } from "../data/repository";
import { errorText, useQuery } from "../lib/hooks";

export function AttachmentViewer({
  type,
  id,
  sectionId,
}: {
  type: Attachment["relatedType"];
  id: string;
  sectionId?: string;
}) {
  const { data = [], error } = useQuery(
    () => attachmentsFor(type, id),
    [type, id],
  );
  const [opened, setOpened] = useState<{
    url: string;
    mimeType: string;
    name: string;
  }>();
  const [openError, setOpenError] = useState("");
  const attachments = data.filter((item) => item.sectionId === sectionId);

  useEffect(
    () => () => {
      if (opened) URL.revokeObjectURL(opened.url);
    },
    [opened],
  );

  const open = async (attachment: Attachment) => {
    try {
      setOpenError("");
      const blob = await attachmentBlob(attachment.id);
      if (!blob) {
        setOpenError("資料が見つかりません。");
        return;
      }
      setOpened((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          url: URL.createObjectURL(blob),
          mimeType: attachment.mimeType,
          name: attachment.name,
        };
      });
    } catch (openFailure) {
      setOpenError(errorText(openFailure));
    }
  };

  if (!attachments.length && !error) return null;
  return (
    <section
      className="journal-detail-resources"
      aria-labelledby="journal-files-heading"
    >
      <h2 id="journal-files-heading">画像・動画</h2>
      <div className="journal-file-list">
        {attachments.map((attachment) => (
          <button
            type="button"
            className="secondary"
            key={attachment.id}
            onClick={() => void open(attachment)}
          >
            {attachment.mimeType.startsWith("video/") ? (
              <Video size={17} aria-hidden="true" />
            ) : (
              <ImageIcon size={17} aria-hidden="true" />
            )}
            {attachment.name}
          </button>
        ))}
      </div>
      {(error || openError) && (
        <p className="error" role="alert">
          {error || openError}
        </p>
      )}
      {opened && (
        <div className="image-detail journal-image-detail">
          <button
            type="button"
            className="secondary"
            onClick={() => setOpened(undefined)}
          >
            資料を閉じる
          </button>
          {opened.mimeType.startsWith("video/") ? (
            <>
              <video src={opened.url} controls playsInline preload="metadata" />
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
    </section>
  );
}
