import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Info, Network, Settings, ShieldPlus } from "lucide-react";
import { checkForUpdates } from "./lib/tauri";
import { useToast } from "./components/Toast";
import { PortsView } from "./views/PortsView";
import { FirewallView } from "./views/FirewallView";
import { AboutView } from "./views/AboutView";
import { SettingsView } from "./views/SettingsView";

type View = "ports" | "firewall" | "settings" | "about";

const NAV: { id: View; label: string; hint: string; icon: typeof Network }[] = [
  { id: "ports", label: "Ports", hint: "Listening ports & processes", icon: Network },
  { id: "firewall", label: "Firewall", hint: "IP → port allow rules", icon: ShieldPlus },
  { id: "settings", label: "Settings", hint: "Sudo & app preferences", icon: Settings },
  { id: "about", label: "About", hint: "App info & updates", icon: Info },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  ports: { title: "Ports", sub: "Listening endpoints on this host" },
  firewall: { title: "Firewall", sub: "Add inbound allow rules" },
  settings: { title: "Settings", sub: "Sudo credentials & preferences" },
  about: { title: "About", sub: "PortGuard details & updates" },
};

export default function App() {
  const [view, setView] = useState<View>("ports");
  const [version, setVersion] = useState<string>("0.0.1");
  const toast = useToast();
  const checked = useRef(false);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.0.1"));
  }, []);

  // Auto-check for updates once on startup
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    let cancelled = false;
    void (async () => {
      let v = "0.0.1";
      try {
        v = await getVersion();
      } catch {
        /* keep fallback */
      }
      const result = await checkForUpdates(v);
      if (cancelled) return;
      if (result.kind === "available") {
        toast.info("Update available", `PortGuard v${result.version} — open About to download & install.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-surface text-ink">
      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        className="flex w-56 shrink-0 flex-col border-r border-line bg-panel"
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <img
            src="/portguard.svg"
            alt="PortGuard logo"
            className="h-8 w-8"
            draggable={false}
          />
          <div>
            <p className="text-sm leading-tight font-bold tracking-tight text-ink">PortGuard</p>
            <p className="text-2xs text-ink3">Network port manager</p>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ id, label, hint, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${active ? "bg-accent-dim text-accent" : "text-ink2 hover:bg-hover hover:text-ink"
                  }`}
              >
                <Icon
                  aria-hidden
                  className={`h-4 w-4 ${active ? "text-accent" : "text-ink3 group-hover:text-ink2"}`}
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span
                    className={`block text-2xs ${active ? "text-accent/70" : "text-ink3"}`}
                  >
                    {hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto px-4 py-3">
          <p className="text-2xs text-ink3">PortGuard v{version} · Rendi Febrian</p>
        </div>
      </nav>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <div>
            <h1 className="text-base leading-tight font-semibold tracking-tight">
              {TITLES[view].title}
            </h1>
            <p className="text-xs text-ink3">{TITLES[view].sub}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          {view === "ports" ? (
            <PortsView />
          ) : view === "firewall" ? (
            <FirewallView />
          ) : view === "settings" ? (
            <SettingsView />
          ) : (
            <AboutView />
          )}
        </div>
      </main>
    </div>
  );
}