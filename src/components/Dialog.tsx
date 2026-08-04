import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    prevFocus.current = document.activeElement as HTMLElement | null;

    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md animate-dialog-in rounded-lg border border-line bg-panel shadow-2xl shadow-black/50 outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}