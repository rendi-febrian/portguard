import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, Shield } from "lucide-react";
import { killPort, listPorts, toErrorMessage, type PortInfo } from "../lib/tauri";
import { useToast } from "../components/Toast";
import { Button } from "../components/ui";
import {
  EmptyState,
  ErrorState,
  PortsTable,
  TableSkeleton,
  type SortKey,
  type SortState,
} from "../components/ports/PortsTable";
import { PortDetail } from "../components/ports/PortDetail";
import { KillDialog } from "../components/ports/KillDialog";

const MIN_REFRESH_DISPLAY_MS = 1000;
const REFRESH_OPTIONS = [5, 10, 15, 30, 60] as const;

function compare(a: PortInfo[SortKey], b: PortInfo[SortKey]): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

const isWildcard = (addr: string) =>
  addr === "0.0.0.0" || addr === "::" || addr === "*" || addr === "0:0:0:0:0:0:0:0";

export function PortsView() {
  const toast = useToast();
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [protoFilter, setProtoFilter] = useState<"all" | "tcp" | "udp">("all");
  const [addrFilter, setAddrFilter] = useState<"all" | "wildcard" | "specific">("all");
  const [auto, setAuto] = useState(false);
  const [intervalSec, setIntervalSec] = useState<number>(15);
  const [admin, setAdmin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "port", dir: 1 });
  const [selected, setSelected] = useState<PortInfo | null>(null);
  const [killTarget, setKillTarget] = useState<PortInfo | null>(null);
  const [killing, setKilling] = useState(false);
  const inFlight = useRef(false);
  const hasData = useRef(false);

  const refresh = useCallback(async (silent = false, elevated = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    const showBar = silent || hasData.current;
    if (showBar) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const started = Date.now();
    try {
      setPorts(await listPorts(elevated));
      hasData.current = true;
      setLastUpdated(Date.now());
    } catch (err) {
      if (!silent) setError(toErrorMessage(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
      if (showBar) {
        // Pastikan bar progres tetap keliatan minimal 1 detik walau refresh cepet
        const wait = Math.max(0, MIN_REFRESH_DISPLAY_MS - (Date.now() - started));
        if (wait > 0) {
          window.setTimeout(() => setRefreshing(false), wait);
        } else {
          setRefreshing(false);
        }
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh(false, admin);
  }, [refresh, admin]);

  useEffect(() => {
    if (!auto) return;
    void refresh(true, admin);
    const id = window.setInterval(() => void refresh(true, admin), intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [auto, refresh, intervalSec, admin]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = ports.filter(
      (p) =>
        (protoFilter === "all" || p.proto === protoFilter) &&
        (addrFilter === "all" ||
          (addrFilter === "wildcard" ? isWildcard(p.local_addr) : !isWildcard(p.local_addr))),
    );
    if (q) {
      list = list.filter(
        (p) =>
          String(p.port).includes(q) ||
          (p.pid !== null && String(p.pid).includes(q)) ||
          (p.process?.toLowerCase().includes(q) ?? false) ||
          p.local_addr.toLowerCase().includes(q) ||
          (p.foreign_addr || "").toLowerCase().includes(q) ||
          p.state.toLowerCase().includes(q),
      );
    }
    const { key, dir } = sort;
    list.sort((a, b) => compare(a[key], b[key]) * dir);
    return list;
  }, [ports, search, protoFilter, addrFilter, sort]);

  const handleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
  };

  const handleKill = useCallback(
    async (target: PortInfo) => {
      if (target.pid == null) return;
      setKilling(true);
      try {
        const msg = await killPort(target.pid);
        toast.success("Process killed", msg);
        setKillTarget(null);
        setSelected((s) => (s?.pid === target.pid ? null : s));
        void refresh(false, admin);
      } catch (err) {
        toast.error("Kill failed", toErrorMessage(err));
      } finally {
        setKilling(false);
      }
    },
    [toast, refresh],
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          {/* Row 1: search + status + refresh */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink3"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="Search port, PID, process, address…"
                aria-label="Search ports"
                className="h-8 w-full rounded-md border border-line bg-raise pr-3 pl-8 text-sm text-ink placeholder:text-ink3 focus:border-accent/60 focus:outline-none"
              />
            </div>

            <span className="ml-auto text-xs text-ink3 tabular-nums">
              {lastUpdated && (
                <span className="mr-3 text-ink3">
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              )}
              {rows.length} / {ports.length} listening
            </span>

            <Button
              variant="outline"
              size="md"
              onClick={() => void refresh(false, admin)}
              disabled={refreshing || loading}
              aria-label="Refresh ports list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Row 2: filters + modes */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 pt-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink2">
              <span className="font-medium text-ink3">Proto</span>
              <select
                value={protoFilter}
                onChange={(e) => setProtoFilter(e.currentTarget.value as "all" | "tcp" | "udp")}
                aria-label="Filter by protocol"
                className="h-8 cursor-pointer rounded-md border border-line bg-raise px-2 font-mono text-xs text-ink focus:border-accent/60 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink2">
              <span className="font-medium text-ink3">Addr</span>
              <select
                value={addrFilter}
                onChange={(e) =>
                  setAddrFilter(e.currentTarget.value as "all" | "wildcard" | "specific")
                }
                aria-label="Filter by listen address"
                className="h-8 cursor-pointer rounded-md border border-line bg-raise px-2 font-mono text-xs text-ink focus:border-accent/60 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="wildcard">Wildcard</option>
                <option value="specific">Specific</option>
              </select>
            </label>

            <span className="hidden h-4 w-px bg-line2 sm:block" aria-hidden />

            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-ink2"
              title="Admin mode: list every PID, including root-owned processes (may prompt for authorization)"
            >
              <button
                type="button"
                role="switch"
                aria-checked={admin}
                aria-label="Admin mode: show all PIDs"
                onClick={() => {
                  const next = !admin;
                  setAdmin(next);
                  if (next) setAuto(false);
                }}
                className={`relative h-[18px] w-8 rounded-full transition-colors ${admin ? "bg-warn" : "bg-line2"}`}
              >
                <span
                  className={`absolute top-[2px] left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${admin ? "translate-x-[14px]" : ""}`}
                />
              </button>
              <Shield className={`h-3.5 w-3.5 ${admin ? "text-warn" : "text-ink3"}`} aria-hidden />
              Admin
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink2">
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                aria-label="Toggle auto-refresh"
                onClick={() => setAuto((a) => !a)}
                className={`relative h-[18px] w-8 rounded-full transition-colors ${auto ? "bg-accent" : "bg-line2"}`}
              >
                <span
                  className={`absolute top-[2px] left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${auto ? "translate-x-[14px]" : ""}`}
                />
              </button>
              Auto-refresh
              <select
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.currentTarget.value))}
                disabled={!auto}
                aria-label="Auto-refresh interval in seconds"
                title="Auto-refresh interval"
                className="h-8 cursor-pointer rounded-md border border-line bg-raise px-2 font-mono text-xs text-ink focus:border-accent/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}s
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Auto-refresh progress */}
        {refreshing && (
          <div
            aria-hidden
            className="pointer-events-none relative h-1 w-full overflow-hidden bg-line"
          >
            <span className="block h-full w-1/3 animate-pg-indeterminate bg-accent/80" />
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}>
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void refresh(false, admin)} />
          ) : rows.length === 0 ? (
            <EmptyState query={search} onRefresh={() => void refresh(false, admin)} />
          ) : (
            <PortsTable
              ports={rows}
              sort={sort}
              onSort={handleSort}
              selected={selected}
              onSelect={setSelected}
              onKill={setKillTarget}
            />
          )}
        </div>
      </div>

      {selected && (
        <PortDetail port={selected} onClose={() => setSelected(null)} onKill={setKillTarget} />
      )}

      <KillDialog
        target={killTarget}
        killing={killing}
        onCancel={() => setKillTarget(null)}
        onConfirm={() => void (killTarget && handleKill(killTarget))}
      />
    </div>
  );
}