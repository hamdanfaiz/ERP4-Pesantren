import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { supabase } from "../utils/supabase";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  callback?: boolean;
  onBack?: () => void;
  onActivated?: () => void;
};

const CONTROL = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";

export function GuardianSelfRegistrationView({ callback = false, onBack, onActivated }: Props) {
  const { refreshProfile, beginGuardianRegistration, completeGuardianRegistration } = useAuth();
  const [tenantName, setTenantName] = useState("");
  const [registrationRedirectUrl, setRegistrationRedirectUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isBusy, setIsBusy] = useState(callback);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const callbackStarted = useRef(false);

  useEffect(() => {
    if (callback) return;
    let cancelled = false;
    void fetch("/api/public/guardian-registration/config", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Pendaftaran akun wali belum tersedia.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setTenantName(String(payload.tenantName || "Pesantren"));
        setRegistrationRedirectUrl(String(payload.registrationRedirectUrl || ""));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Pendaftaran akun wali belum tersedia.");
      });
    return () => { cancelled = true; };
  }, [callback]);

  useEffect(() => {
    if (!callback) return;
    if (callbackStarted.current) return;
    callbackStarted.current = true;
    let cancelled = false;
    const finishRegistration = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const authError = query.get("error_description") || hash.get("error_description");
        const accessToken = query.get("access_token") || hash.get("access_token");
        const refreshToken = query.get("refresh_token") || hash.get("refresh_token");
        const authCode = query.get("code") || hash.get("code");

        if (authError) throw new Error("Tautan verifikasi email tidak valid atau telah kedaluwarsa.");
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) throw new Error("Sesi pendaftaran tidak dapat diverifikasi. Buka kembali tautan terbaru dari email.");
        } else if (authCode) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError || !data.session?.user) throw new Error("Sesi verifikasi tidak dapat dibuka. Buka kembali tautan terbaru dari email.");
        }
        window.history.replaceState(null, "", window.location.pathname + "?guardianRegistration=1");

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (sessionError || !session?.user || !session.access_token) {
          throw new Error("Buka tautan verifikasi dari email yang Anda daftarkan, lalu coba kembali.");
        }
        if (!session.user.email_confirmed_at) {
          setNotice("Pendaftaran akun diterima. Konfirmasikan alamat email melalui tautan yang dikirim sebelum mengaktifkan Portal Wali.");
          return;
        }

        const response = await fetch("/api/guardian-registration/claim", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Akun belum dapat ditautkan ke data wali.");
        if (payload.success !== true) {
          setNotice(payload.message || "Email terverifikasi, tetapi belum cocok dengan data wali aktif. Akun belum memperoleh akses ERP. Hubungi sekretariat untuk memperbarui email pada data PPDB.");
          return;
        }

        await refreshProfile();
        if (cancelled) return;
        setActivated(true);
        onActivated?.();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Pendaftaran Portal Wali gagal diproses.");
      } finally {
        if (!cancelled) setIsBusy(false);
      }
    };
    void finishRegistration();
    return () => { cancelled = true; };
  }, [callback, onActivated, refreshProfile]);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!tenantName || !registrationRedirectUrl) {
      setError("Pendaftaran Portal Wali belum diaktifkan untuk lingkungan ini.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    if (password.length < 12) {
      setError("Kata sandi harus minimal 12 karakter.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Konfirmasi kata sandi belum sama.");
      return;
    }

    setIsBusy(true);
    try {
      const redirectTo = registrationRedirectUrl;
      beginGuardianRegistration();
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (signupError) throw new Error("Akun belum dapat didaftarkan. Periksa alamat email dan coba kembali.");
      if (data.session?.user) {
        window.location.assign(redirectTo);
        return;
      }
      completeGuardianRegistration();
      setConfirmationSent(true);
      setNotice("Jika alamat email dapat didaftarkan, tautan konfirmasi telah dikirim. Buka email tersebut untuk melanjutkan aktivasi akun.");
    } catch (cause) {
      completeGuardianRegistration();
      setError(cause instanceof Error ? cause.message : "Pendaftaran akun wali gagal diproses.");
    } finally {
      setIsBusy(false);
    }
  };

  const exit = async () => {
    try { await supabase.auth.signOut(); } catch { /* Leaving the access setup route remains fail-closed. */ }
    completeGuardianRegistration();
    onBack?.();
  };
  const goBack = () => {
    completeGuardianRegistration();
    onBack?.();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans">
      <section className="w-full max-w-lg space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl sm:p-8">
        <header className="text-center">
          <div className="mb-3 inline-flex rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-300">
            {activated ? <CheckCircle2 className="h-8 w-8" /> : callback ? <ShieldCheck className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{activated ? "Akun Portal Wali aktif" : "Pendaftaran Akun Wali"}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {activated ? "Email terverifikasi dan akun tertaut ke data wali santri." : tenantName ? `Buat akun sendiri untuk ${tenantName}.` : "Buat akun Portal Wali dengan email yang tercatat di data PPDB."}
          </p>
        </header>

        {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {notice && <div role="status" className="flex gap-2 rounded-xl border border-sky-500/20 bg-sky-950/30 p-3 text-sm text-sky-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

        {callback ? (
          isBusy ? <div className="flex justify-center gap-2 py-4 text-sm text-slate-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Memverifikasi email dan tautan akun…</div>
            : activated ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-sm text-emerald-100">Anda akan masuk ke Portal Wali dengan akses sesuai relasi wali-santri yang terverifikasi.</div>
              : <button type="button" onClick={() => void exit()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700"><LogOut className="h-4 w-4" />Kembali ke halaman masuk</button>
        ) : confirmationSent ? (
          <button type="button" onClick={goBack} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">Kembali ke halaman masuk</button>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="guardian-signup-email" className="mb-1.5 block text-xs font-semibold text-slate-300">Email wali yang tercatat pada data PPDB</label>
              <input id="guardian-signup-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={CONTROL} placeholder="wali@example.com" />
            </div>
            <div>
              <label htmlFor="guardian-signup-password" className="mb-1.5 block text-xs font-semibold text-slate-300">Buat kata sandi</label>
              <input id="guardian-signup-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className={CONTROL} />
            </div>
            <div>
              <label htmlFor="guardian-signup-password-confirm" className="mb-1.5 block text-xs font-semibold text-slate-300">Ulangi kata sandi</label>
              <input id="guardian-signup-password-confirm" type="password" autoComplete="new-password" required minLength={12} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className={CONTROL} />
            </div>
            <p className="text-xs leading-5 text-slate-400">Supabase Auth mengelola kata sandi. Akses sistem baru diberikan setelah email dikonfirmasi dan cocok dengan email pada data wali santri aktif.</p>
            <button type="submit" disabled={isBusy || !tenantName || !registrationRedirectUrl} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {isBusy ? "Mendaftarkan akun…" : "Daftar dan kirim tautan konfirmasi"}
            </button>
          </form>
        )}

        {!callback && <p className="text-center text-xs text-slate-500">Belum ada email wali pada data PPDB? Hubungi sekretariat pesantren untuk memperbarui data kontak.</p>}
        {onBack && !callback && <button type="button" onClick={goBack} className="w-full text-sm text-slate-400 hover:text-white">← Kembali ke halaman masuk</button>}
      </section>
    </main>
  );
}
