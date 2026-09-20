import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

export function FloatingAddButton({
  actions,
  label = "追加",
}: {
  actions: { label: string; onClick: () => void }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="floating-add" ref={container}>
      {open && (
        <div
          className="floating-add-options"
          id={panelId}
          role="group"
          aria-label="追加方法"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="secondary"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        className="primary floating-add-trigger"
        aria-label={
          open
            ? "追加方法を閉じる"
            : actions.length === 1
              ? actions[0].label
              : label
        }
        aria-expanded={actions.length > 1 ? open : undefined}
        aria-controls={open ? panelId : undefined}
        onClick={() =>
          actions.length === 1 ? actions[0].onClick() : setOpen(!open)
        }
      >
        {open ? <X size={24} aria-hidden="true" /> : <Plus size={24} aria-hidden="true" />}
      </button>
    </div>
  );
}
