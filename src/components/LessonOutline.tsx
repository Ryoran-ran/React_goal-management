import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2 } from "lucide-react";
import { parseLessonOutline } from "../lib/lessonOutline";
import { pageScrollTop, scrollPageTo } from "../lib/pageScroll";

export function LessonOutline({ text }: { text: string }) {
  const outline = parseLessonOutline(text);
  const items = outline.filter((part) => part.kind === "item");
  return (
    <div className="lesson-outline">
      {outline
        .filter((part) => part.kind === "paragraph")
        .map((part, index) => (
          <p key={index}>{part.text}</p>
        ))}
      {items.length > 0 && (
        <ul>
          {items.map((item, index) => (
            <li key={index}>
              <span>{item.text}</span>
              {item.details.length > 0 && (
                <div className="lesson-outline-details">
                  {item.details.join("\n")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LessonOutlineField({
  label,
  value,
  onChange,
  context = "レッスン全体",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  context?: string;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const returnScroll = useRef(0);
  const close = () => {
    setExpanded(false);
    requestAnimationFrame(() => {
      expandButton.current?.focus({ preventScroll: true });
      scrollPageTo(returnScroll.current);
    });
  };
  return (
    <div className="lesson-outline-field">
      <div className="lesson-outline-heading">
        <label className="field-title" htmlFor={preview ? undefined : inputId}>
          {label}
        </label>
        <button
          ref={expandButton}
          type="button"
          className="text-button"
          aria-label={`${label}を広く書く`}
          aria-haspopup="dialog"
          onClick={() => {
            returnScroll.current = pageScrollTop();
            setExpanded(true);
          }}
        >
          <Maximize2 size={16} aria-hidden="true" />
          広く書く
        </button>
      </div>
      <OutlineMode preview={preview} onChange={setPreview} label={label} />
      <div hidden={preview}>
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {preview && <OutlinePreview label={label} value={value} />}
      {expanded &&
        createPortal(
          <OutlineDialog
            label={label}
            context={context}
            value={value}
            onChange={onChange}
            onClose={close}
          />,
          document.body,
        )}
    </div>
  );
}

function OutlineMode({
  preview,
  onChange,
  label,
}: {
  preview: boolean;
  onChange: (preview: boolean) => void;
  label: string;
}) {
  return (
    <div
      className="segmented lesson-outline-mode"
      role="group"
      aria-label={`${label}の表示切り替え`}
    >
      <button
        type="button"
        className={!preview ? "active" : ""}
        aria-pressed={!preview}
        onClick={() => onChange(false)}
      >
        入力
      </button>
      <button
        type="button"
        className={preview ? "active" : ""}
        aria-pressed={preview}
        onClick={() => onChange(true)}
      >
        プレビュー
      </button>
    </div>
  );
}

function OutlinePreview({ label, value }: { label: string; value: string }) {
  return (
    <section
      className="lesson-outline-preview"
      aria-label={`${label}のプレビュー`}
    >
      <LessonOutline text={value} />
    </section>
  );
}

function OutlineDialog({
  label,
  context,
  value,
  onChange,
  onClose,
}: {
  label: string;
  context: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState(false);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const viewport = window.visualViewport;
    const resize = () => {
      element.style.setProperty(
        "--outline-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      element.style.setProperty(
        "--outline-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      element.style.setProperty(
        "--outline-left",
        `${viewport?.offsetLeft ?? 0}px`,
      );
      element.style.setProperty(
        "--outline-width",
        `${viewport?.width ?? window.innerWidth}px`,
      );
    };
    resize();
    element.showModal();
    textarea.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="lesson-outline-dialog"
      aria-labelledby={titleId}
      data-outline-dialog
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // Portals still bubble through the parent form's React event handlers.
        event.stopPropagation();
        if (
          event.key === "Enter" &&
          event.ctrlKey &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        ) {
          event.preventDefault();
          if (!event.repeat) onClose();
        }
      }}
    >
      <header className="lesson-outline-dialog-heading">
        <div>
          <p className="muted">{context}</p>
          <h2 id={titleId}>{label}</h2>
        </div>
        <button type="button" className="primary" onClick={onClose}>
          完了
        </button>
      </header>
      <OutlineMode
        preview={preview}
        label={label}
        onChange={(next) => {
          setPreview(next);
          if (!next)
            requestAnimationFrame(() =>
              textarea.current?.focus({ preventScroll: true }),
            );
        }}
      />
      <div className="lesson-outline-dialog-content">
        <textarea
          ref={textarea}
          hidden={preview}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {preview && <OutlinePreview label={label} value={value} />}
      </div>
    </dialog>
  );
}
