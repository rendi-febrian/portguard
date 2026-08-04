import { Copy, X, XCircle } from "lucide-react";
import type { PortInfo } from "../../lib/tauri";
import { useToast } from "../Toast";
import { Badge, Button } from "../ui";

function Field({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-wider text-ink3 uppercase">{label}</dt>
      <dd className={`mt-0.5 break-all text-sm text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

interface PortDetailProps {
  port: PortInfo;
  onClose: () => void;
  onKill: (p: PortInfo) => void;
}

export function PortDetail({ port, onClose, onKill }: PortDetailProps) {
  const toast = useToast();

  const copyAddr = () => {
    void navigator.clipboard.writeText(port.local_addr).then(() => {
      toast.info("Copied", port.local_addr);
    });
  };

  return (
    <aside
      aria-label={`Details for port ${port.port}`}
      className="flex w-80 shrink-0 flex-col border-l border-line bg-panel"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-xl font-semibold text-accent tabular-nums">{port.port}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone={port.proto === "tcp" ? "tcp" : "udp"}>{port.proto}</Badge>
            <Badge>{port.state || "—"}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <dl className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Process" mono={false} value={port.process ?? "Unknown"} />
        <Field label="PID" value={port.pid == null ? "—" : String(port.pid)} />
        <Field label="Local address" value={port.local_addr} />
        <Field label="Foreign address" value={port.foreign_addr || "—"} />
      </dl>

      <footer className="space-y-2 border-t border-line p-4">
        <Button variant="outline" size="md" className="w-full" onClick={copyAddr}>
          <Copy className="h-3.5 w-3.5" /> Copy local address
        </Button>
        <Button
          variant="danger"
          size="md"
          className="w-full"
          disabled={port.pid == null}
          title={port.pid == null ? "PID hidden — needs elevated privileges" : undefined}
          onClick={() => onKill(port)}
        >
          <XCircle className="h-3.5 w-3.5" />
          Kill process{port.pid != null ? ` (PID ${port.pid})` : ""}
        </Button>
        {port.pid == null && (
          <p className="text-xs text-ink3">
            PID hidden — run PortGuard with elevated privileges to kill this process.
          </p>
        )}
      </footer>
    </aside>
  );
}