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

/** Add a firewall allow rule: ip -> port/proto. Port may be a single number or a range like "3000-3010". */
export function firewallAllow(ip: string, port: string, proto: Proto): Promise<string> {
  return invoke<string>("firewall_allow", { ip, port, proto });
}

/** Delete a firewall rule by its spec/name. */
export function deleteFirewallRule(spec: string): Promise<string> {
  return invoke<string>("delete_firewall_rule", { spec });
}

/** Enable or disable the native firewall. */
export function setFirewallEnabled(enabled: boolean): Promise<string> {
  return invoke<string>("set_firewall_enabled", { enabled });
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

/** IPv4/IPv6, optionally with a CIDR prefix (e.g. 192.168.1.0/24). */
export function isValidIpOrCidr(value: string): boolean {
  const v = value.trim();
  if (!v.includes("/")) return isValidIp(v);
  const [addr, prefix] = v.split("/");
  if (!isValidIp(addr) || prefix.trim() === "") return false;
  const p = Number(prefix);
  if (!Number.isInteger(p)) return false;
  const max = addr.includes(":") ? 128 : 32;
  return p >= 0 && p <= max;
}

/** Normalize a port input: "8080" or "3000-3010". Returns null when invalid. */
export function parsePortRange(value: string): string | null {
  const v = value.trim();
  const valid = (p: string): boolean => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;
  if (valid(v)) return v;
  const m = /^(\d{1,5})[-:]( *\d{1,5})$/.exec(v);
  if (m && valid(m[1]) && valid(m[2]) && Number(m[1]) <= Number(m[2])) {
    return `${m[1]}-${m[2]}`;
  }
  return null;
}

/** Port in 1..65535, or null when invalid. */
export function parsePort(value: string): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 65535 ? n : null;
}

/** List all TCP/UDP sockets (listening + established). */
export function listConnections(elevated = false): Promise<PortInfo[]> {
  return invoke<PortInfo[]>("list_connections", { elevated });
}

/** True if a TCP connection can be opened to host:port within 1.5s. */
export function probePort(host: string, port: number): Promise<boolean> {
  return invoke<boolean>("probe_port", { host, port });
}

/** Open a URL in the default browser. */
export function openUrl(url: string): Promise<void> {
  return invoke<void>("open_url", { url });
}

export interface ProcessDetail {
  pid: number;
  name: string | null;
  user: string | null;
  cmdline: string | null;
  exe: string | null;
  memory_kb: number | null;
}

/** Process details from /proc (Linux only). */
export function processDetail(pid: number): Promise<ProcessDetail> {
  return invoke<ProcessDetail>("process_detail", { pid });
}

/** Export the current port list to ~/Downloads. Resolves with the saved path. */
export function exportPorts(ports: PortInfo[], format: "csv" | "json"): Promise<string> {
  return invoke<string>("export_ports", { ports, format });
}

/* ---- Service names ---- */

const SERVICE_NAMES: Record<number, string> = {
  20: "FTP-DATA",
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  67: "DHCP",
  68: "DHCP",
  69: "TFTP",
  80: "HTTP",
  110: "POP3",
  123: "NTP",
  137: "NetBIOS",
  138: "NetBIOS",
  139: "SMB",
  143: "IMAP",
  161: "SNMP",
  389: "LDAP",
  443: "HTTPS",
  445: "SMB",
  514: "syslog",
  587: "SMTP",
  631: "IPP",
  636: "LDAPS",
  993: "IMAPS",
  995: "POP3S",
  1080: "SOCKS",
  1194: "OpenVPN",
  1433: "MSSQL",
  1701: "L2TP",
  1883: "MQTT",
  2379: "etcd",
  2380: "etcd",
  3000: "Dev",
  3306: "MySQL",
  3389: "RDP",
  3690: "SVN",
  5000: "Dev",
  5432: "PostgreSQL",
  5672: "AMQP",
  6379: "Redis",
  6443: "K8s API",
  8000: "Dev",
  8008: "HTTP",
  8080: "HTTP-alt",
  8443: "HTTPS-alt",
  8888: "Dev",
  9000: "Dev",
  9090: "Prometheus",
  9200: "Elasticsearch",
  9300: "Elasticsearch",
  9418: "Git",
  11211: "Memcached",
  15672: "RabbitMQ",
  27017: "MongoDB",
};

/** Well-known service name for a port, or null. */
export function serviceName(port: number): string | null {
  return SERVICE_NAMES[port] ?? null;
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

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export type UpdateResult =
  | { kind: "latest" }
  | { kind: "available"; version: string; url: string; assets: ReleaseAsset[] }
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
    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      assets?: ReleaseAsset[];
    };
    const latest = String(data.tag_name ?? data.name ?? "0.0.0").replace(/^v/, "");
    if (compareSemver(latest, current.replace(/^v/, "")) > 0) {
      return {
        kind: "available",
        version: latest,
        url: data.html_url ?? `https://github.com/${owner}/${repo}/releases`,
        assets: Array.isArray(data.assets) ? data.assets : [],
      };
    }
    return { kind: "latest" };
  } catch (err) {
    return { kind: "error", message: toErrorMessage(err) };
  }
}

/** Pick the release asset that matches this OS, preferring installers over portable builds. */
export function pickAsset(
  os: string,
  version: string,
  assets: ReleaseAsset[],
): ReleaseAsset | null {
  const wants: string[] =
    os === "linux"
      ? [".deb", ".AppImage"]
      : os === "windows"
        ? [".msi", ".exe"]
        : [".dmg"];
  const prefix = `PortGuard_${version}_`;
  for (const ext of wants) {
    const hit = assets.find(
      (a) => a.name.startsWith(prefix) && a.name.endsWith(ext) && !a.name.includes("blockmap"),
    );
    if (hit) return hit;
  }
  return null;
}

/** Download a release asset into ~/Downloads. Resolves with the saved path. */
export function downloadRelease(url: string, destName: string): Promise<string> {
  return invoke<string>("download_release", { url, destName });
}

/** Install a downloaded release artifact. */
export function installRelease(path: string): Promise<string> {
  return invoke<string>("install_release", { path });
}
