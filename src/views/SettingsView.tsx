import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Moon, ShieldCheck, ShieldOff, Sun } from "lucide-react";
import {
  clearSudoPassword,
  hasSudoPassword,
  setSudoPassword,
  toErrorMessage,
} from "../lib/tauri";
import { useToast } from "../components/Toast";
import { Badge, Button, Spinner } from "../components/ui";

const INPUT =
  "h-9 w-full rounded-md border border-line bg-raise px-3 text-sm text-ink placeholder:text-ink3 focus:border-accent/60 focus:outline-none";

export function SettingsView() {
  const toast = useToast();
  const [stored, setStored] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("portguard:theme") as "dark" | "light") || "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("portguard:theme", theme);
  }, [theme]);

  const load = useCallback(async () => {
    try {
      setStored(await hasSudoPassword());
    } catch {
      setStored(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Empty password", "Enter the sudo password before saving.");
      return;
    }
    setSaving(true);
    try {
      await setSudoPassword(password);
      setPassword("");
      setReveal(false);
      setStored(await hasSudoPassword());
      toast.success("Stored", "Sudo password saved to the OS keyring (encrypted).");
      await load();
    } catch (err) {
      toast.error("Could not save", toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await clearSudoPassword();
      setStored(false);
      toast.success("Removed", "Sudo password deleted from the keyring.");
    } catch (err) {
      toast.error("Could not remove", toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-5">
        {/* Sudo credentials */}
        <section className="rounded-lg border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent ring-1 ring-accent/30">
                <KeyRound className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Sudo credentials</h2>
                <p className="text-xs text-ink3">Password for elevated operations</p>
              </div>
            </div>
            {stored === null ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Badge tone={stored ? "accent" : "neutral"}>
                {stored ? (
                  <>
                    <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Stored
                  </>
                ) : (
                  <>
                    <ShieldOff className="mr-1 h-3 w-3" aria-hidden /> Not stored
                  </>
                )}
              </Badge>
            )}
          </div>

          <p className="mt-3 text-sm leading-relaxed text-ink2">
            Store the sudo password in the OS <span className="font-mono">keyring</span> once. After
            that, every operation that needs root — listing PIDs, firewall, kill — runs automatically{" "}
            <span className="font-medium text-ink">without a prompt</span>. The password is stored
            encrypted, not in a plaintext file.
          </p>

          <form noValidate onSubmit={(e) => void save(e)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="sudo-pw" className="mb-1.5 block text-xs font-medium text-ink2">
                Sudo password
              </label>
              <div className="relative">
                <input
                  id="sudo-pw"
                  type={reveal ? "text" : "password"}
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  placeholder="••••••••"
                  className={`${INPUT} pr-10`}
                />
                <button
                  type="button"
                  aria-label={reveal ? "Hide password" : "Show password"}
                  onClick={() => setReveal((r) => !r)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-ink3 hover:text-ink"
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="md" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" colorClass="text-accent-ink" /> : <KeyRound className="h-4 w-4" />}
                Save
              </Button>
              {stored && (
                <Button variant="danger" size="md" onClick={() => void clear()} disabled={saving}>
                  <ShieldOff className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </form>

          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-ink3">
            If no password is stored, PortGuard falls back to{" "}
            <span className="font-mono">pkexec</span>, showing a system authorization prompt on
            every elevated operation. Storing the password is only recommended on a trusted
            personal machine.
          </p>
        </section>

        {/* Appearance */}
        <section className="rounded-lg border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent ring-1 ring-accent/30">
                {theme === "light" ? (
                  <Sun className="h-5 w-5" aria-hidden />
                ) : (
                  <Moon className="h-5 w-5" aria-hidden />
                )}
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Appearance</h2>
                <p className="text-xs text-ink3">Theme preference, saved locally</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex max-w-xs overflow-hidden rounded-md border border-line">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                  theme === t ? "bg-accent-dim text-accent" : "bg-raise text-ink2 hover:text-ink"
                }`}
              >
                {t === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}