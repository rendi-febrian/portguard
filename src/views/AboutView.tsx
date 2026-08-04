import { useCallback, useEffect, useState } from "react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { Download, ExternalLink, Info, Sparkles } from "lucide-react";
import {
  checkForUpdates,
  downloadRelease,
  getSystemInfo,
  installRelease,
  pickAsset,
  toErrorMessage,
  type UpdateResult,
} from "../lib/tauri";
import { useToast } from "../components/Toast";
import { Badge, Button, Spinner } from "../components/ui";

const INFO_BASE = "flex items-center justify-between gap-4 rounded-md bg-surface px-3 py-2";
const LABEL = "flex items-center gap-2 text-xs font-medium text-ink3";
const VALUE = "font-mono text-sm text-ink";

const UPDATE_PANEL: Record<UpdateResult["kind"], { text: string; tone: "success" | "accent" | "muted" | "danger"; url?: string }> = {
  latest: { text: "You're on the latest release.", tone: "success" },
  available: { text: "A new version is available.", tone: "accent" },
  "no-release": { text: "No GitHub release published yet.", tone: "muted" },
  error: { text: "Could not reach the update server.", tone: "danger" },
};

const TONE_TEXT: Record<string, string> = {
  success: "text-accent",
  accent: "text-info",
  muted: "text-ink3",
  danger: "text-danger",
};

const TONE_BADGE: Record<string, "accent" | "info" | "neutral" | "danger"> = {
  success: "accent",
  accent: "info",
  muted: "neutral",
  danger: "danger",
};

export function AboutView() {
  const toast = useToast();
  const [version, setVersion] = useState<string>("…");
  const [tauriVersion, setTauriVersion] = useState<string>("…");
  const [sys, setSys] = useState<{ os: string; arch: string } | null>(null);
  const [state, setState] = useState<{ status: "idle" | "checking" } | ({ status: "done" } & UpdateResult)>(
    { status: "idle" }
  );
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setVersion(await getVersion());
      } catch {
        setVersion("—");
      }
      try {
        setTauriVersion(await getTauriVersion());
      } catch {
        setTauriVersion("—");
      }
      try {
        setSys(await getSystemInfo());
      } catch {
        setSys(null);
      }
    })();
  }, []);

  const check = useCallback(async () => {
    setState({ status: "checking" });
    const result = await checkForUpdates(version === "…" ? "0.0.0" : version);
    setState({ status: "done", ...result });
  }, [version]);

  const install = async () => {
    if (state.status !== "done" || state.kind !== "available" || !sys) return;
    const asset = pickAsset(sys.os, state.version, state.assets);
    if (!asset) {
      toast.error("No installer for this platform", `${sys.os} ${sys.arch} — download it from the release page.`);
      return;
    }
    setUpdating(true);
    try {
      const path = await downloadRelease(asset.browser_download_url, asset.name);
      const msg = await installRelease(path);
      toast.success("Update downloaded & installed", msg);
    } catch (err) {
      toast.error("Update failed", toErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const panel = state.status === "done" ? UPDATE_PANEL[state.kind] : null;
  const tone =
    state.status === "done" ? TONE_TEXT[state.kind] : state.status === "checking" ? "text-ink3" : "text-ink3";

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-5">
        {/* App */}
        <section className="rounded-lg border border-line bg-panel p-6">
          <div className="flex items-center gap-4">
            <img
              src="/portguard.svg"
              alt="PortGuard logo"
              className="h-14 w-14 shrink-0"
              draggable={false}
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-ink">PortGuard</h2>
              <p className="text-sm text-ink3">Network port manager for Linux, Windows & macOS</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="accent">App v{version}</Badge>
            <Badge tone="neutral">Tauri {tauriVersion}</Badge>
            {sys && <Badge tone="neutral">{sys.os} · {sys.arch}</Badge>}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink2">
            Inspect the network services listening on this host, identify the process behind each
            port, terminate it, and open inbound firewall exceptions for a specific IP address.
          </p>

          <div className="mt-5 space-y-1.5">
            {(sys
              ? [
                  { label: "Operating system", value: sys.os },
                  { label: "Architecture", value: sys.arch },
                  { label: "Author", value: "Rendi Febrian" },
                  { label: "License", value: "MIT" },
                  { label: "Source", value: "github.com/rendi-febrian/portguard" },
                ]
              : [
                  { label: "Author", value: "Rendi Febrian" },
                  { label: "License", value: "MIT" },
                  { label: "Source", value: "github.com/rendi-febrian/portguard" },
                ]
            ).map((row) => (
              <div key={row.label} className={INFO_BASE}>
                <span className={LABEL}>{row.label}</span>
                <span className={VALUE}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2 border-t border-line pt-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
            <p className="text-xs leading-relaxed text-ink3">
              On Linux, listing owns-process PIDs and firewalling require elevated privileges; the
              app requests the system authorization prompt only when needed.
            </p>
          </div>
        </section>

        {/* Updates */}
        <section className="rounded-lg border border-line bg-panel p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-info" aria-hidden />
            Updates
          </h3>
          <p className="mt-1 text-xs text-ink3">
            Check for newer releases published on GitHub. Current version:{" "}
            <span className="font-mono text-ink2">v{version}</span>.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => void check()}
              disabled={state.status === "checking"}
            >
              {state.status === "checking" ? (
                <Spinner className="h-4 w-4" colorClass="text-accent-ink" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {state.status === "checking" ? "Checking…" : "Check for updates"}
            </Button>

            {state.status === "done" && panel && (
              <div className={`flex flex-wrap items-center gap-2 text-sm ${tone}`}>
                <Badge tone={TONE_BADGE[state.kind]}>{state.kind}</Badge>
                <span>{panel.text}</span>
                {state.kind === "available" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updating}
                      onClick={() => void install()}
                    >
                      {updating ? (
                        <Spinner className="h-3.5 w-3.5" colorClass="text-accent" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {updating ? "Downloading…" : "Download & Install"}
                    </Button>
                    {panel.url && (
                      <a
                        href={panel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-info underline-offset-2 hover:underline"
                      >
                        Release page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {state.status === "done" && state.kind === "error" && (
            <p className="mt-2 text-xs text-danger">{toErrorMessage(state.message)}</p>
          )}
        </section>
      </div>
    </div>
  );
}