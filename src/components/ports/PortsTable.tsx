import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  RefreshCw,
  SearchX,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { PortInfo } from "../../lib/tauri";
import { serviceName } from "../../lib/tauri";
import { Badge, Button } from "../ui";

export type SortKey =
  | "proto"
  | "port"
  | "local_addr"
  | "foreign_addr"
  | "state"
  | "pid"
  | "process";

export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

interface Column {
  key: SortKey;
  label: string;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "proto", label: "Proto" },
  { key: "port", label: "Port" },
  { key: "local_addr", label: "Local Address", className: "min-w-[160px]" },
  { key: "foreign_addr", label: "Foreign Address", className: "min-w-[120px]" },
  { key: "state", label: "State" },
  { key: "pid", label: "PID" },
  { key: "process", label: "Process", className: "min-w-[140px]" },
];

export function stateTone(state: string): "accent" | "neutral" {
  return state.toLowerCase() === "listen" ? "accent" : "neutral";
}

interface SortHeaderProps {
  col: Column;
  sort: SortState;
  onSort: (key: SortKey) => void;
}

function SortHeader({ col, sort, onSort }: SortHeaderProps) {
  const active = sort.key === col.key;
  const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className={`px-3 py-2 text-left text-2xs font-semibold tracking-wider text-ink3 uppercase ${col.className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? "text-accent" : "text-ink2 hover:text-ink"}`}
      >
        {col.label}
        <Icon aria-hidden className={`h-3 w-3 ${active ? "text-accent" : "text-ink3/60"}`} />
      </button>
    </th>
  );
}

interface TableProps {
  ports: PortInfo[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  selected: PortInfo | null;
  onSelect: (p: PortInfo) => void;
  onKill: (p: PortInfo) => void;
}

export function PortsTable({ ports, sort, onSort, selected, onSelect, onKill }: TableProps) {
  return (
    <table className="w-full min-w-[840px] border-collapse text-sm">
      <thead>
        <tr className="border-b border-line bg-panel">
          {COLUMNS.map((col) => (
            <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
          ))}
          <th scope="col" aria-label="Actions" className="w-10 px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {ports.map((p, i) => (
          <PortRow
            key={`${p.proto}:${p.local_addr}:${p.port}:${p.pid ?? "?"}:${p.fd ?? "?"}:${i}`}
            row={p}
            selected={
              selected?.proto === p.proto &&
              selected.port === p.port &&
              selected.pid === p.pid
            }
            onSelect={onSelect}
            onKill={onKill}
          />
        ))}
      </tbody>
    </table>
  );
}

interface RowProps {
  row: PortInfo;
  selected: boolean;
  onSelect: (p: PortInfo) => void;
  onKill: (p: PortInfo) => void;
}

function PortRow({ row, selected, onSelect, onKill }: RowProps) {
  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row);
        }
      }}
      className={`cursor-pointer border-b border-line/60 transition-colors ${
        selected ? "bg-accent-dim/60" : "hover:bg-hover"
      }`}
    >
      <td className="px-3 py-2">
        <Badge tone={row.proto === "tcp" ? "tcp" : "udp"}>{row.proto}</Badge>
      </td>
      <td className="px-3 py-2">
        <div className="font-mono font-semibold text-accent tabular-nums">{row.port}</div>
        {serviceName(row.port) && (
          <div className="text-2xs text-ink3">{serviceName(row.port)}</div>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-ink2">{row.local_addr}</td>
      <td className="px-3 py-2 font-mono text-ink3">{row.foreign_addr || "—"}</td>
      <td className="px-3 py-2">
        <Badge tone={stateTone(row.state)}>{row.state || "—"}</Badge>
      </td>
      <td className="px-3 py-2 font-mono text-ink2 tabular-nums">
        {row.pid ?? <span title="PID hidden — run PortGuard with elevated privileges">—</span>}
      </td>
      <td className="px-3 py-2 text-ink">{row.process ?? <span className="text-ink3">—</span>}</td>
      <td className="px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="text-ink3 hover:text-danger disabled:hover:text-ink3"
          disabled={row.pid == null}
          title={
            row.pid == null
              ? "PID hidden — needs elevated privileges"
              : `Kill ${row.process ?? `PID ${row.pid}`}`
          }
          aria-label={`Kill process on port ${row.port}`}
          onClick={(e) => {
            e.stopPropagation();
            onKill(row);
          }}
        >
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

export function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading ports" className="border-t border-line/60 px-4 py-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-b border-line/60 px-0 py-3"
          style={{ opacity: 1 - i * 0.09 }}
        >
          <div className="h-4 w-12 animate-pulse rounded bg-raise" />
          <div className="h-4 w-16 animate-pulse rounded bg-raise" />
          <div className="h-4 min-w-40 flex-1 animate-pulse rounded bg-raise" />
          <div className="h-4 w-32 flex-1 animate-pulse rounded bg-raise" />
          <div className="h-4 w-16 animate-pulse rounded bg-raise" />
          <div className="h-4 w-12 animate-pulse rounded bg-raise" />
          <div className="h-4 w-24 animate-pulse rounded bg-raise" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ query, onRefresh }: { query: string; onRefresh: () => void }) {
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
      <SearchX className="h-8 w-8 text-ink3" />
      <h3 className="mt-1 text-sm font-semibold text-ink">
        {query ? "No ports match your search" : "No listening ports"}
      </h3>
      <p className="max-w-xs text-xs text-ink3">
        {query
          ? `Nothing matches “${query}”. Try a port number, PID, process name, or address.`
          : "No ports are currently open on this host. Start a service, then refresh."}
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </Button>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
      <TriangleAlert className="h-8 w-8 text-danger" />
      <h3 className="mt-1 text-sm font-semibold text-ink">Failed to list ports</h3>
      <p className="max-w-sm text-xs text-ink3">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}