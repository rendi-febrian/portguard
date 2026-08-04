import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />,
  error: <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />,
  info: <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />,
};

const TOAST_TTL_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, title, message }]);
      window.setTimeout(() => dismiss(id), TOAST_TTL_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message) => push("success", title, message),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex animate-toast-in items-start gap-2.5 rounded-lg border border-line bg-raise p-3 shadow-lg shadow-black/40"
          >
            {ICONS[t.kind]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.message && (
                <p className="mt-0.5 break-words text-xs text-ink2">{t.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 text-ink3 transition-colors hover:bg-hover hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}