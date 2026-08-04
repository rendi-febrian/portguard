import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
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
      toast.error("Password kosong", "Isi password sudo dulu sebelum menyimpan.");
      return;
    }
    setSaving(true);
    try {
      await setSudoPassword(password);
      setPassword("");
      setReveal(false);
      setStored(await hasSudoPassword());
      toast.success("Tersimpan", "Password sudo disimpan di keyring OS (terenkripsi).");
      await load();
    } catch (err) {
      toast.error("Gagal menyimpan", toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await clearSudoPassword();
      setStored(false);
      toast.success("Dihapus", "Password sudo dihapus dari keyring.");
    } catch (err) {
      toast.error("Gagal menghapus", toErrorMessage(err));
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
                <p className="text-xs text-ink3">Password untuk operasi elevated</p>
              </div>
            </div>
            {stored === null ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Badge tone={stored ? "accent" : "neutral"}>
                {stored ? (
                  <>
                    <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Tersimpan
                  </>
                ) : (
                  <>
                    <ShieldOff className="mr-1 h-3 w-3" aria-hidden /> Belum disimpan
                  </>
                )}
              </Badge>
            )}
          </div>

          <p className="mt-3 text-sm leading-relaxed text-ink2">
            Simpan password sudo ke <span className="font-mono">keyring OS</span> sekali. Setelah
            itu semua operasi yang butuh root — daftar PID, firewall, kill — jalan otomatis{" "}
            <span className="font-medium text-ink">tanpa prompt</span>. Password tersimpan
            terenkripsi, bukan file plaintext.
          </p>

          <form noValidate onSubmit={(e) => void save(e)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="sudo-pw" className="mb-1.5 block text-xs font-medium text-ink2">
                Password sudo
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
                  aria-label={reveal ? "Sembunyikan password" : "Tampilkan password"}
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
                Simpan
              </Button>
              {stored && (
                <Button variant="danger" size="md" onClick={() => void clear()} disabled={saving}>
                  <ShieldOff className="h-4 w-4" />
                  Hapus
                </Button>
              )}
            </div>
          </form>

          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-ink3">
            Jika password tidak disimpan, PortGuard di balik layar memakai{" "}
            <span className="font-mono">pkexec</span> — muncul prompt otorisasi sistem tiap
            operasi elevated. Menyimpan password cuma disarankan di mesin pribadi aman.
          </p>
        </section>
      </div>
    </div>
  );
}