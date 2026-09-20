import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { FloatingAddButton } from "./FloatingAddButton";
import { errorText } from "../lib/hooks";
import { handleFormKeyDown } from "../lib/formKeyboard";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function PageHeading({
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{title}</h1>
        </div>
      </header>
      {action && onAction && (
        <FloatingAddButton actions={[{ label: action, onClick: onAction }]} />
      )}
    </>
  );
}
export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; title: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      {options.length ? (
        options.map((option) => (
          <label
            className={`choice ${value.includes(option.id) ? "selected" : ""}`}
            key={option.id}
          >
            <input
              type="checkbox"
              checked={value.includes(option.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, option.id]
                    : value.filter((id) => id !== option.id),
                )
              }
            />
            {option.title}
          </label>
        ))
      ) : (
        <small>まだ登録されていません。</small>
      )}
    </fieldset>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress-line">
      <progress max={100} value={value} />
      <span>{value}%</span>
    </div>
  );
}
export function SaveForm({
  children,
  onSave,
  onCancel,
  onDelete,
  saveLabel = "保存する",
  deleteLabel = "削除",
  deleteConfirmation = "この記録と添付資料を削除しますか？ この操作は取り消せません。",
}: {
  children: ReactNode;
  onSave: () => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
  saveLabel?: string;
  deleteLabel?: string;
  deleteConfirmation?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || busy) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await onSave();
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function destroy() {
    if (!window.confirm(deleteConfirmation)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete?.();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      onChange={() => setSaved(false)}
      onKeyDownCapture={(event) =>
        handleFormKeyDown(event, busy || submitting.current)
      }
    >
      <fieldset disabled={busy} className="form-body">
        {children}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="success">
            保存しました。
          </p>
        )}
        <p className="muted">Ctrl＋Enterで「{saveLabel}」を実行できます。</p>
        <footer className="form-actions">
          {onDelete && (
            <button
              type="button"
              className="danger text-button"
              onClick={destroy}
            >
              {deleteLabel}
            </button>
          )}
          <div className="spacer" />
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              キャンセル
            </button>
          )}
          <button
            className="primary"
            type="submit"
            aria-keyshortcuts="Control+Enter"
          >
            {busy ? "保存中…" : saveLabel}
          </button>
        </footer>
      </fieldset>
    </form>
  );
}
export function Editor({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <section className="editor card">
      <header className="section-heading">
        <h2>{title}</h2>
        <button
          aria-label="編集を閉じる"
          className="icon-button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </section>
  );
}
