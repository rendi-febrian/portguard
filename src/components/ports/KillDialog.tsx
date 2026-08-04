import type { PortInfo } from "../../lib/tauri";
import { Dialog } from "../Dialog";
import { Button, Spinner } from "../ui";

interface KillDialogProps {
  target: PortInfo | null;
  killing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function KillDialog({ target, killing, onCancel, onConfirm }: KillDialogProps) {
  if (!target) return null;

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Kill process"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={killing}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={killing}>
            {killing && <Spinner className="h-3.5 w-3.5" colorClass="text-white/80" />}
            {killing ? "Killing…" : "Kill process"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink2">
        This will terminate{" "}
        <span className="font-semibold text-ink">{target.process ?? "the process"}</span>{" "}
        (PID <span className="font-mono text-accent">{target.pid}</span>), currently listening on
        port <span className="font-mono text-accent">{target.port}</span>
        {target.proto === "udp" ? " (UDP)" : ""}.
      </p>
      <p className="mt-2 text-xs text-warn">
        Services on this port will stop responding. This action cannot be undone.
      </p>
    </Dialog>
  );
}