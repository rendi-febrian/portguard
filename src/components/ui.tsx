import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

/* ---- Button ---- */

type Variant = "primary" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent font-semibold text-accent-ink hover:bg-accent/90 active:bg-accent/80 disabled:bg-accent/40",
  outline:
    "border border-line2 text-ink hover:bg-hover hover:border-ink3 disabled:text-ink3",
  ghost: "text-ink2 hover:bg-hover hover:text-ink disabled:text-ink3",
  danger:
    "bg-danger-solid font-semibold text-white hover:bg-danger-solid/90 active:bg-danger-solid/80 disabled:bg-danger-solid/40",
};

const SIZES = {
  sm: "h-7 gap-1.5 px-2 text-xs",
  md: "h-8 gap-2 px-3 text-sm",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZES;
}

export function Button({ variant = "outline", size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}

/* ---- Spinner ---- */

export function Spinner({
  className = "h-4 w-4",
  colorClass = "text-accent",
}: {
  className?: string;
  colorClass?: string;
}) {
  return <Loader2 aria-hidden className={`animate-spin ${colorClass} ${className}`} />;
}

/* ---- Badge ---- */

type BadgeTone = "tcp" | "udp" | "accent" | "neutral" | "warn" | "info" | "danger";

const TONES: Record<BadgeTone, string> = {
  tcp: "border-info/25 bg-info-dim text-info",
  udp: "border-warn/25 bg-warn-dim text-warn",
  accent: "border-accent/25 bg-accent-dim text-accent",
  neutral: "border-line2 bg-raise text-ink2",
  warn: "border-warn/25 bg-warn-dim text-warn",
  info: "border-info/25 bg-info-dim text-info",
  danger: "border-danger/25 bg-danger-dim text-danger",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase leading-none tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}