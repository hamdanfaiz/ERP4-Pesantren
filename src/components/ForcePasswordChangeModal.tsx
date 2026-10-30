import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, ShieldCheck, AlertCircle, Eye, EyeOff, LogOut, CheckCircle2 } from 'lucide-react';

export function ForcePasswordChangeModal() {
  const { user, changeInitialPassword, refreshProfile, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user?.mustChangePassword) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 12) {
      setError('Kata sandi baru harus memiliki panjang minimal 12 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Password update and server-owned requirement flag are handled in one authenticated API flow.
      await changeInitialPassword(newPassword);

      // 3. Refresh user profile in AuthContext
      await refreshProfile();

      setSuccess(true);
    } catch (err: any) {
      const msg = err.message || 'Gagal mengubah kata sandi. Silakan coba kembali.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-500/30 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-950 to-slate-900 border-b border-emerald-800/30 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Wajib Ubah Kata Sandi</h2>
              <p className="text-xs text-slate-300">Aktivasi Keamanan Akun Pertama Kali</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Kata Sandi Berhasil Diperbarui!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Akun Anda kini telah diamankan dan siap digunakan.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Halo <strong>{user.name}</strong>, Anda menggunakan kata sandi sementara. Demi keamanan data pesantren, Anda wajib membuat kata sandi baru (minimal 12 karakter) sebelum mengakses sistem.
                </span>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Kata Sandi Baru (Min. 12 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                    placeholder="Minimal 12 karakter aman..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  placeholder="Ketik ulang kata sandi baru..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan Kata Sandi...</span>
                    </>
                  ) : (
                    <span>Simpan & Masuk ke Sistem</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2 px-4 text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Batalkan dan Keluar (Logout)</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
