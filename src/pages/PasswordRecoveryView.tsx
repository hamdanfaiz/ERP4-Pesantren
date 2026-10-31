import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, supabaseClientConfigured } from '../utils/supabase';

type Props = {
  onCompleted: () => void;
  onBack: () => void;
};

const CONTROL = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';

type RecoveryVerification = { ok: true } | { ok: false; message: string };

function callbackValue(query: URLSearchParams, hash: URLSearchParams, key: string): string | null {
  return query.get(key) || hash.get(key);
}

export function PasswordRecoveryView({ onCompleted, onBack }: Props) {
  const { completePasswordRecovery } = useAuth();
  const verificationPromise = useRef<Promise<RecoveryVerification> | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [completed, setCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!verificationPromise.current) verificationPromise.current = (async (): Promise<RecoveryVerification> => {
      try {
        if (!supabaseClientConfigured()) return { ok: false, message: 'Layanan pemulihan akun belum dikonfigurasi. Hubungi administrator.' };

        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const authError = callbackValue(query, hash, 'error_description') || callbackValue(query, hash, 'error');
        if (authError) return { ok: false, message: 'Tautan pemulihan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.' };

        const code = callbackValue(query, hash, 'code');
        const accessToken = callbackValue(query, hash, 'access_token');
        const refreshToken = callbackValue(query, hash, 'refresh_token');
        const callbackType = callbackValue(query, hash, 'type');

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError || !data.session?.user) {
            return { ok: false, message: 'Tautan pemulihan tidak dapat diverifikasi. Minta tautan baru dari halaman masuk.' };
          }
        } else if (accessToken && refreshToken && callbackType === 'recovery') {
          const { data, error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError || !data.session?.user) {
            return { ok: false, message: 'Tautan pemulihan tidak dapat diverifikasi. Minta tautan baru dari halaman masuk.' };
          }
        } else {
          // A callback can already have exchanged its one-time code before a
          // development StrictMode effect replay or a browser refresh. Reuse
          // that authenticated session instead of leaving the recovery page stuck.
          const { data: existingSession, error: existingSessionError } = await supabase.auth.getSession();
          if (existingSessionError || !existingSession.session?.user) {
            return { ok: false, message: 'Tautan pemulihan tidak lengkap atau sudah digunakan. Minta tautan baru dari halaman masuk.' };
          }
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.user) {
          return { ok: false, message: 'Sesi pemulihan tidak ditemukan. Minta tautan baru dari halaman masuk.' };
        }

        return { ok: true };
      } catch (cause) {
        return { ok: false, message: cause instanceof Error ? cause.message : 'Tautan pemulihan tidak dapat diverifikasi.' };
      }
    })();

    // StrictMode replays effects in development. Keep one exchange promise and let
    // the live effect consume its result so cleanup cannot strand the spinner.
    void verificationPromise.current.then((result) => {
      if (cancelled) return;
      if (!('message' in result)) {
        // Remove one-time credentials from the address bar after the SDK has exchanged them.
        window.history.replaceState(null, '', `${window.location.pathname}?passwordRecovery=1`);
        setHasRecoverySession(true);
      } else {
        setError(result.message);
      }
      setIsVerifying(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 12 || password.length > 128) {
      setError('Kata sandi baru harus terdiri dari 12 sampai 128 karakter.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Konfirmasi kata sandi belum sama.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error('Kata sandi belum dapat diperbarui. Pastikan kata sandi memenuhi ketentuan, lalu coba kembali.');
      try { await supabase.auth.signOut(); } catch { /* The password is already updated; returning to sign-in remains safe. */ }
      setCompleted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kata sandi belum dapat diperbarui.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = async () => {
    setIsLeaving(true);
    try { await supabase.auth.signOut(); } catch { /* Leave the password recovery route fail-closed. */ }
    completePasswordRecovery();
    onBack();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans">
      <section className="w-full max-w-lg space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl sm:p-8">
        <header className="text-center">
          <div className="mb-3 inline-flex rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-300">
            {hasRecoverySession ? <KeyRound className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Buat kata sandi baru</h1>
          <p className="mt-2 text-sm text-slate-400">Gunakan kata sandi baru yang hanya Anda ketahui.</p>
        </header>

        {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {isVerifying ? (
          <div className="flex justify-center gap-2 py-4 text-sm text-slate-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Memeriksa tautan pemulihan…</div>
        ) : completed ? (
          <div className="space-y-4">
            <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0" />Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru.</div>
            <button type="button" onClick={() => { completePasswordRecovery(); onCompleted(); }} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">Kembali ke halaman masuk</button>
          </div>
        ) : hasRecoverySession ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="recovery-password" className="mb-1.5 block text-xs font-semibold text-slate-300">Kata sandi baru</label>
              <input id="recovery-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={CONTROL} />
            </div>
            <div>
              <label htmlFor="recovery-password-confirm" className="mb-1.5 block text-xs font-semibold text-slate-300">Ulangi kata sandi baru</label>
              <input id="recovery-password-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className={CONTROL} />
            </div>
            <p className="text-xs leading-5 text-slate-400">Minimal 12 karakter. Password diproses oleh Supabase Auth dan tidak disimpan di browser sebagai data aplikasi.</p>
            <button type="submit" disabled={isSaving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {isSaving ? 'Memperbarui kata sandi…' : 'Simpan kata sandi baru'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-400">Minta tautan pemulihan baru dari halaman masuk, lalu buka tautan tersebut pada alamat aplikasi yang aktif.</p>
            <button type="button" onClick={() => void handleBack()} disabled={isLeaving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50">
              {isLeaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Kembali ke halaman masuk
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

