import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "../utils/supabase";
import { useAuth } from "../contexts/AuthContext";

export function GuardianInvitationActivationView({
  token,
  onActivated,
}: {
  token: string;
  onActivated: () => void;
}) {
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token") || query.get("access_token");
    const refreshToken = hash.get("refresh_token") || query.get("refresh_token");
    const authCode = query.get("code") || hash.get("code");
    const authError = hash.get("error_description") || query.get("error_description");

    // The invitation token is already held in React state. Remove query parameters
    // immediately, but retain the callback fragment until the session is established.
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);

    void (async () => {
      try {
        if (authError) throw new Error("Tautan autentikasi tidak valid atau telah kedaluwarsa.");
        if (!((accessToken && refreshToken) || authCode)) {
          throw new Error("Tautan aktivasi belum diverifikasi. Buka tautan undangan terbaru dari email Anda.");
        }
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw new Error("Sesi aktivasi tidak dapat diverifikasi. Buka kembali tautan undangan.");
          window.history.replaceState(null, "", window.location.pathname);
        } else if (authCode) {
          const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError || !exchanged.session?.user) {
            throw new Error("Sesi aktivasi tidak dapat diverifikasi. Buka kembali tautan undangan.");
          }
          window.history.replaceState(null, "", window.location.pathname);
        }
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.user) {
          throw new Error("Buka tautan undangan dari email yang didaftarkan, lalu coba kembali.");
        }
        if (!data.session.user.email_confirmed_at) {
          throw new Error("Konfirmasikan email undangan sebelum membuat kata sandi.");
        }
        const verificationResponse = await fetch("/api/guardian-invitations/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + data.session.access_token,
          },
          body: JSON.stringify({ token }),
        });
        const verification = await verificationResponse.json().catch(() => ({}));
        if (!verificationResponse.ok) {
          throw new Error(verification.error || "Undangan tidak cocok dengan akun email yang terverifikasi.");
        }
        const verifiedEmail = String(verification.email || "").trim().toLowerCase();
        if (verifiedEmail !== String(data.session.user.email || "").trim().toLowerCase()) {
          throw new Error("Email sesi tidak cocok dengan email undangan.");
        }
        if (!cancelled) setEmail(verifiedEmail);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Sesi undangan tidak valid.");
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleActivate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setError("Tautan aktivasi tidak valid atau telah kedaluwarsa.");
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

    setIsSubmitting(true);
    try {
      const { data: current, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !current.session?.user || !current.session.access_token) {
        throw new Error("Sesi aktivasi telah berakhir. Buka kembali tautan undangan.");
      }
      const sessionEmail = String(current.session.user.email || "").trim().toLowerCase();
      if (sessionEmail !== email.trim().toLowerCase()) {
        throw new Error("Sesi masuk tidak sesuai dengan email undangan.");
      }
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw new Error(passwordError.message || "Kata sandi baru tidak dapat disimpan.");

      // Updating the password may refresh the user's session. Use the latest bearer
      // token for the server-side invitation claim rather than the pre-update token.
      const { data: updatedSession, error: updatedSessionError } = await supabase.auth.getSession();
      if (updatedSessionError || !updatedSession.session?.user || !updatedSession.session.access_token) {
        throw new Error("Sesi aktivasi telah berakhir. Buka kembali tautan undangan.");
      }
      if (String(updatedSession.session.user.email || "").trim().toLowerCase() !== email.trim().toLowerCase()) {
        throw new Error("Sesi masuk tidak sesuai dengan email undangan.");
      }

      const response = await fetch("/api/guardian-invitations/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + updatedSession.session.access_token,
        },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Undangan Wali tidak dapat diaktifkan.");

      await refreshProfile();
      setSuccess(true);
      onActivated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktivasi akun Wali gagal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950 font-sans">
      <section className="glass-panel max-w-lg w-full p-6 sm:p-8 space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl">
        <header className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 mb-3">
            {success ? <CheckCircle2 className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            {success ? "Akun Wali berhasil diaktifkan" : "Aktivasi Akun Wali Santri"}
          </h1>
          <p className="text-xs text-slate-400 mt-2">
            {success
              ? "Akun Anda sudah tertaut ke data Wali dan santri pada tenant pesantren."
              : "Konfirmasi email undangan dan buat kata sandi Anda sendiri."}
          </p>
        </header>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isPreparing ? (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-slate-400" role="status">
            <LoaderCircle className="w-4 h-4 animate-spin" /> Memeriksa tautan undangan…
          </div>
        ) : success ? (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-200 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Anda dapat melanjutkan ke aplikasi dengan sesi yang telah diverifikasi.
          </div>
        ) : !email ? (
          <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-slate-300 text-xs" role="status">
            Aktivasi hanya dapat dilanjutkan dari tautan verifikasi email yang masih berlaku.
          </div>
        ) : (
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email undangan</label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-400"
              />
            </div>
            <div>
              <label htmlFor="guardian-new-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Buat kata sandi</label>
              <input
                id="guardian-new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="guardian-confirm-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Ulangi kata sandi</label>
              <input
                id="guardian-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <p className="text-[11px] text-slate-400">Gunakan minimal 12 karakter. Kata sandi dikelola oleh Supabase Auth dan tidak disimpan oleh ERP.</p>
            <button
              type="submit"
              disabled={isSubmitting || isPreparing || !email}
              className="w-full py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {isSubmitting ? "Mengaktifkan akun…" : "Aktifkan akun"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}