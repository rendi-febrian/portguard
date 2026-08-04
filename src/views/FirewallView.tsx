import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Info, RefreshCw, Shield, ShieldPlus } from "lucide-react";
import {
  firewallAllow,
  getFirewallStatus,
  isValidIp,
  listFirewallRules,
  parsePort,
  toErrorMessage,
  type FirewallRule,
  type FirewallStatus,
  type Proto,
} from "../lib/tauri";
import { useToast } from "../components/Toast";
import { Badge, Button, Spinner } from "../components/ui";

const RULE_EXAMPLES: { os: string; cmd: string }[] = [
  {
    os: "Linux · ufw",
    cmd: "ufw allow from <IP> to any port <PORT> proto <PROTO>",
  },
  {
    os: "Windows · netsh",
    cmd: 'netsh advfirewall firewall add rule name="PortGuard" dir=in action=allow protocol=<PROTO> localport=<PORT> remoteip=<IP>',
  },
  {
    os: "macOS · pf",
    cmd: "pf anchor rule (Application Firewall exception)",
  },
];

const INPUT_BASE =
  "h-9 w-full rounded-md border bg-raise px-3 font-mono text-sm text-ink placeholder:text-ink3 focus:outline-none focus:ring-1";
const INPUT_OK = "border-line focus:border-accent/60 focus:ring-accent/30";
const INPUT_BAD = "border-danger/60 focus:border-danger focus:ring-danger/30";

const PROTO_BTN = (active: boolean) =>
  `h-8 flex-1 cursor-pointer rounded-md border font-mono text-xs font-semibold transition-colors ${
    active
      ? "border-accent/50 bg-accent-dim text-accent"
      : "border-line bg-raise text-ink2 hover:border-line2 hover:text-ink"
  }`;

export function FirewallView() {
  const toast = useToast();
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [proto, setProto] = useState<Proto>("tcp");
  const [errors, setErrors] = useState<{ ip?: string; port?: string }>({});
  const [pending, setPending] = useState(false);

  const [status, setStatus] = useState<FirewallStatus | null>(null);
  const [rules, setRules] = useState<FirewallRule[] | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const loadRules = useCallback(async (elevated: boolean) => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      setRules(await listFirewallRules(elevated));
    } catch (err) {
      setRules(null);
      setRulesError(toErrorMessage(err));
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await getFirewallStatus());
      } catch {
        setStatus(null);
      }
    })();
    void loadRules(false);
  }, [loadRules]);

  const validateIp = (v: string) =>
    v.trim() === "" ? "IP address is required." : isValidIp(v) ? undefined : "Enter a valid IPv4 or IPv6 address.";
  const validatePort = (v: string) =>
    v.trim() === "" ? "Port is required." : parsePort(v) === null ? "Port must be an integer between 1 and 65535." : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ipErr = validateIp(ip);
    const portErr = validatePort(port);
    setErrors({ ip: ipErr, port: portErr });
    if (ipErr || portErr) return;

    setPending(true);
    try {
      const msg = await firewallAllow(ip.trim(), parsePort(port)!, proto);
      toast.success("Rule added", msg);
      setIp("");
      setPort("");
    } catch (err) {
      toast.error("Could not add rule", toErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-5">
        {/* Header */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent ring-1 ring-accent/30">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">Firewall</h2>
              <p className="text-xs text-ink3">Native allow rules for this host</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <Badge tone={status.enabled ? "accent" : "warn"}>
                {status.backend} · {status.enabled ? "active" : "inactive"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRules(true)}
              disabled={rulesLoading}
              aria-label="Load firewall rules as admin"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rulesLoading ? "animate-spin" : ""}`} />
              Load as admin
            </Button>
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* Form */}
          <section className="rounded-lg border border-line bg-panel p-5">
            <h2 className="text-base font-semibold text-ink">Allow traffic</h2>
            <p className="mt-0.5 text-xs text-ink3">
              Permit inbound connections from a single IP to one port.
            </p>

            <form noValidate onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
              <div>
                <label htmlFor="fw-ip" className="mb-1.5 block text-xs font-medium text-ink2">
                  IP address
                </label>
                <input
                  id="fw-ip"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. 192.168.1.50 or 2001:db8::1"
                  value={ip}
                  onChange={(e) => setIp(e.currentTarget.value)}
                  onBlur={() => setErrors((er) => ({ ...er, ip: validateIp(ip) }))}
                  aria-invalid={errors.ip ? true : undefined}
                  aria-describedby={errors.ip ? "fw-ip-error" : undefined}
                  className={`${INPUT_BASE} ${errors.ip ? INPUT_BAD : INPUT_OK}`}
                />
                {errors.ip && (
                  <p id="fw-ip-error" role="alert" className="mt-1.5 text-xs text-danger">
                    {errors.ip}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="fw-port" className="mb-1.5 block text-xs font-medium text-ink2">
                  Port
                </label>
                <input
                  id="fw-port"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 8080"
                  value={port}
                  onChange={(e) => setPort(e.currentTarget.value)}
                  onBlur={() => setErrors((er) => ({ ...er, port: validatePort(port) }))}
                  aria-invalid={errors.port ? true : undefined}
                  aria-describedby={errors.port ? "fw-port-error" : undefined}
                  className={`${INPUT_BASE} ${errors.port ? INPUT_BAD : INPUT_OK}`}
                />
                {errors.port && (
                  <p id="fw-port-error" role="alert" className="mt-1.5 text-xs text-danger">
                    {errors.port}
                  </p>
                )}
              </div>

              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink2">Protocol</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Protocol">
                  {(["tcp", "udp"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={proto === p}
                      onClick={() => setProto(p)}
                      className={PROTO_BTN(proto === p)}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
                {pending ? (
                  <Spinner className="h-4 w-4" colorClass="text-accent-ink" />
                ) : (
                  <ShieldPlus className="h-4 w-4" />
                )}
                {pending ? "Adding rule…" : "Allow"}
              </Button>
            </form>

            {pending && (
              <p role="status" className="mt-3 text-xs text-warn">
                A system authorization prompt may appear — this is required to modify the firewall.
              </p>
            )}
          </section>

          {/* Rules */}
          <section className="flex min-h-[320px] flex-col rounded-lg border border-line bg-panel p-5">
            <h2 className="text-base font-semibold text-ink">Active rules</h2>
            <p className="mt-0.5 text-xs text-ink3">Allow rules currently installed.</p>

            <div className="mt-4 flex-1">
              {rulesLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink3">
                  <Spinner className="h-4 w-4" />
                  Loading rules…
                </div>
              ) : rulesError ? (
                <div className="rounded-md bg-danger-dim p-3">
                  <p role="alert" className="text-sm text-danger">
                    {rulesError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => void loadRules(true)}
                  >
                    Load as admin
                  </Button>
                </div>
              ) : rules && rules.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-md bg-surface px-4 py-8 text-center">
                  <Shield className="h-6 w-6 text-ink3" aria-hidden />
                  <p className="text-sm font-medium text-ink2">No allow rules yet</p>
                  {status && !status.enabled && status.backend === "ufw" ? (
                    <p className="max-w-xs text-xs leading-relaxed text-warn">
                      UFW is inactive — rules won't take effect. Enable it first, then add rules:
                      <code className="mt-1 block rounded bg-raise px-1.5 py-0.5 font-mono text-ink2">
                        sudo ufw enable
                      </code>
                    </p>
                  ) : (
                    <p className="max-w-xs text-xs leading-relaxed text-ink3">
                      Rules you add with the form appear here. On Linux this lists your ufw rules and
                      may require authorization.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {rules?.map((r) => (
                    <li key={r.spec} className="flex flex-col gap-2 rounded-md bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={r.action === "deny" ? "danger" : "accent"}>
                          {r.action}
                        </Badge>
                        {r.ip && <Badge tone="info">{r.ip}</Badge>}
                        {r.port !== null && <Badge tone="neutral">:{r.port}</Badge>}
                        {r.proto && <Badge tone="udp">{r.proto}</Badge>}
                      </div>
                      <code className="break-all font-mono text-2xs text-ink2">{r.spec}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-4 flex items-start gap-2 border-t border-line pt-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
              <span className="text-xs leading-relaxed text-ink3">
                On Linux, reading ufw rules needs elevation — use{" "}
                <span className="font-mono">Load as admin</span> when the list is empty. On Windows
                it shows rules named <span className="font-mono">PortGuard</span>.
              </span>
            </p>
          </section>
        </div>

        {/* How it works */}
        <details className="group rounded-lg border border-line bg-panel p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink2 hover:text-ink">
            <Info className="h-4 w-4 text-info" aria-hidden />
            How the rule is applied
            <span className="ml-auto text-xs text-ink3 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4 space-y-2.5">
            {RULE_EXAMPLES.map((r) => (
              <div key={r.os} className="flex flex-col gap-0.5">
                <span className="text-2xs font-semibold tracking-wider text-ink3 uppercase">
                  {r.os}
                </span>
                <code className="break-all rounded bg-raise px-1.5 py-0.5 font-mono text-2xs text-ink2">
                  {r.cmd}
                </code>
              </div>
            ))}
            <p className="pt-2 text-xs leading-relaxed text-ink3">
              PortGuard runs an elevated helper to install the rule on your host's native firewall.
              Rules persist across reboots where the platform supports it. Removing a rule is not
              yet supported — manage existing rules with your system firewall tool.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}