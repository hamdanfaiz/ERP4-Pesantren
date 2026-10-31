import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, LogIn, ShieldCheck, UserCheck } from 'lucide-react';
import { GuardianSelfRegistrationView } from './GuardianSelfRegistrationView';
import { supabase, supabaseClientConfigured } from '../utils/supabase';
import { passwordRecoveryErrorMessage } from '../utils/passwordRecoveryErrorMessage';

export function LoginView({ onBack }: { onBack: () => void }) {
  const { login, isLoading } = useAuth();
  const [showGuardianRegistration, setShowGuardianRegistration] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);

  if (showGuardianRegistration) {
    return <GuardianSelfRegistrationView onBack={() => setShowGuardianRegistration(false)} />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login gagal. Silakan coba kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordRecovery = async () => {
    setRecoveryError(null);
    setRecoveryNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setRecoveryError('Masukkan email akun terlebih dahulu.');
      return;
    }
    if (!supabaseClientConfigured()) {
      setRecoveryError('Pemulihan kata sandi belum dikonfigurasi. Hubungi administrator pesantren.');
      return;
    }

    setIsSendingRecovery(true);
    try {
      const redirectTo = new URL('/?passwordRecovery=1', window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) {
        setRecoveryError(passwordRecoveryErrorMessage(error));
        return;
      }
      setRecoveryNotice('Jika email tersebut terdaftar, tautan untuk membuat kata sandi baru akan dikirim ke kotak masuknya.');
    } catch {
      setRecoveryError('Permintaan pemulihan belum dapat diproses. Coba kembali beberapa saat lagi.');
    } finally {
      setIsSendingRecovery(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 font-sans">
      <div className="glass-panel max-w-lg w-full p-6 sm:p-8 space-y-6 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
            <UserCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100">Portal Pesantren Terpadu</h2>
          <p className="text-xs text-slate-400 mt-1">
            Masuk untuk mengakses layanan akademik, absensi, keuangan, dan asrama.
          </p>
        </div>

        {loginError && (
          <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{loginError}</span>
          </div>
        )}
        {recoveryError && (
          <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{recoveryError}</span>
          </div>
        )}
        {recoveryNotice && (
          <div role="status" aria-live="polite" className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs">
            {recoveryNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-1.5">Email akun</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@pesantren.id"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Kata sandi</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => void handlePasswordRecovery()}
                disabled={isSendingRecovery || isSubmitting || isLoading}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSendingRecovery ? 'Mengirim permintaan…' : 'Lupa kata sandi?'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-950/40 cursor-pointer flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Memverifikasi akun...' : 'Masuk'}
          </button>
        </form>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <p>Akun staf dibuat oleh administrator pesantren. Wali santri dapat mendaftar sendiri menggunakan email yang tercatat pada data PPDB.</p>
        </div>

        <div className="text-center">
          <button type="button" onClick={() => setShowGuardianRegistration(true)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
            Wali santri? Daftar akun sendiri
          </button>
        </div>

        <div className="pt-4 border-t border-slate-800 text-center">
          <button onClick={onBack} type="button" className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
            &larr; Kembali ke Beranda PPDB
          </button>
        </div>
      </div>
    </div>
  );
}

