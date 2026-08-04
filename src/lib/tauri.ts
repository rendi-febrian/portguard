import { invoke } from "@tauri-apps/api/core";

export type Proto = "tcp" | "udp";

export interface PortInfo {
  proto: Proto;
  local_addr: string;
  port: number;
  foreign_addr: string;
  state: string;
  pid: number | null;
  process: string | null;
  fd: number | null;
}

/** List currently listening ports. `elevated` reads every PID (Linux: prompts for authorization). */
export function listPorts(elevated = false): Promise<PortInfo[]> {
  return invoke<PortInfo[]>("list_ports", { elevated });
}

/** Kill the process owning `pid`. Resolves with a success message. */
export function killPort(pid: number): Promise<string> {
  return invoke<string>("kill_port", { pid });
}

/** Add a firewall allow rule: ip -> port/proto. */
export function firewallAllow(ip: string, port: number, proto: Proto): Promise<string> {
  return invoke<string>("firewall_allow", { ip, port, proto });
}

export interface FirewallRule {
  action: string;
  ip: string | null;
  port: number | null;
  proto: string;
  spec: string;
}

/** List currently active allow rules added by this app (or user rules on Linux). */
export function listFirewallRules(elevated = false): Promise<FirewallRule[]> {
  return invoke<FirewallRule[]>("list_firewall_rules", { elevated });
}

export interface FirewallStatus {
  backend: string;
  enabled: boolean;
}

/** Native firewall backend + enabled state (no elevation required). */
export function getFirewallStatus(): Promise<FirewallStatus> {
  return invoke<FirewallStatus>("firewall_status");
}

/* ---- Sudo credentials (Linux keyring) ---- */

/** Store the sudo password in the OS keyring. No prompt needed afterwards. */
export function setSudoPassword(password: string): Promise<void> {
  return invoke<void>("set_sudo_password", { password });
}

/** Remove the stored sudo password from the keyring. */
export function clearSudoPassword(): Promise<void> {
  return invoke<void>("clear_sudo_password");
}

/** Whether a sudo password is currently stored in the keyring. */
export function hasSudoPassword(): Promise<boolean> {
  return invoke<boolean>("has_sudo_password");
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

/** IPv4 or IPv6, strict. */
export function isValidIp(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 45) return false;

  const v4 = IPV4_RE.exec(v);
  if (v4) return v4.slice(1).every((octet) => Number(octet) <= 255);

  return IPV6_RE.test(v);
}

/** Port in 1..65535, or null when invalid. */
export function parsePort(value: string): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 65535 ? n : null;
}

/** Normalize an unknown invoke rejection into a readable message. */
export function toErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export interface SystemInfo {
  os: string;
  arch: string;
}

/** OS + CPU architecture, reported by the Rust backend. */
export function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("system_info");
}

/* ---- Update check (GitHub Releases) ---- */

const REPO = { owner: "rendi-febrian", repo: "portguard" };

export type UpdateResult =
  | { kind: "latest" }
  | { kind: "available"; version: string; url: string }
  | { kind: "no-release" }
  | { kind: "error"; message: string };

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Compare `current` against the latest GitHub release. Handles a not-yet-published repo. */
export async function checkForUpdates(current: string): Promise<UpdateResult> {
  const { owner, repo } = REPO;
  if (!owner || !repo) return { kind: "no-release" };
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (res.status === 404) return { kind: "no-release" };
    if (!res.ok) return { kind: "error", message: `GitHub API responded ${res.status}` };
    const data = (await res.json()) as { tag_name?: string; name?: string; html_url?: string };
    const latest = String(data.tag_name ?? data.name ?? "0.0.0").replace(/^v/, "");
    if (compareSemver(latest, current.replace(/^v/, "")) > 0) {
      return {
        kind: "available",
        version: latest,
        url: data.html_url ?? `https://github.com/${owner}/${repo}/releases`,
      };
    }
    return { kind: "latest" };
  } catch (err) {
    return { kind: "error", message: toErrorMessage(err) };
  }
}
