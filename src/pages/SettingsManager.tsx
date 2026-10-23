import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Shield, 
  Globe, 
  Database, 
  Building, 
  Smartphone, 
  Save, 
  CheckCircle2, 
  XCircle, 
  Image as ImageIcon, 
  Upload, 
  Download, 
  Lock, 
  Unlock, 
  Check, 
  AlertTriangle,
  RefreshCw,
  Send,
  CreditCard,
  Layers,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  useSystemSettings 
} from '../hooks/useSystemSettings';
import { 
  GeneralSettings, 
  OrgInfo, 
  IntegrationsConfig, 
  MobileConfig,
  SYSTEM_ROLES,
  ALL_MODULE_LIST 
} from '../services/systemSettingsService';
import { UserRole } from '../rbac';
import { ModuleId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getAccessToken } from '../authSession';
import { supabaseRuntimeEnabled } from '../runtimeBackend';

const SUPABASE_SYSTEM_SETTINGS = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_SYSTEM_SETTINGS);
const SUPABASE_SYSTEM_SETTINGS_IMPORT = import.meta.env.VITE_SUPABASE_SYSTEM_SETTINGS_IMPORT_ENABLED === 'true';

export function SettingsManager() {
  const { role, user, refreshProfile } = useAuth();
  const { 
    settings, 
    general, 
    orgInfo: currentOrgInfo, 
    integrations: currentIntegrations, 
    mobileConfig: currentMobileConfig,
    permissions: currentPermissions,
    updateSettings,
    settingsReady,
    settingsLoadError,
    retrySettingsLoad,
    exportBackup
  } = useSystemSettings();

  const [activeTab, setActiveTab] = useState<'general' | 'organization' | 'security' | 'integrations' | 'mobile' | 'backup'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [settingsConflict, setSettingsConflict] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [settingsMigrationBusy, setSettingsMigrationBusy] = useState(false);
  const [settingsMigrationReport, setSettingsMigrationReport] = useState<any>(null);
  const [settingsMigrationError, setSettingsMigrationError] = useState<string | null>(null);
  const runSettingsMigration = async (apply: boolean) => {
    setSettingsMigrationBusy(true);
    setSettingsMigrationError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/system/settings/migrate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          apply,
          ...(apply ? {
            confirmation: 'IMPORT_TENANT_SYSTEM_SETTINGS',
            previewFingerprint: settingsMigrationReport?.previewFingerprint,
          } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Migrasi pengaturan tenant gagal.');
      setSettingsMigrationReport(payload);
    } catch (error: any) {
      setSettingsMigrationError(error?.message || 'Migrasi pengaturan tenant gagal.');
    } finally {
      setSettingsMigrationBusy(false);
    }
  };

  // Local form states initialized from store
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(general);
  const [orgInfo, setOrgInfo] = useState<OrgInfo>(currentOrgInfo);
  const [integrations, setIntegrations] = useState<IntegrationsConfig>(currentIntegrations);
  const [mobileConfig, setMobileConfig] = useState<MobileConfig>(currentMobileConfig);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>(currentPermissions);

  // Sync local state when store updates
  useEffect(() => {
    setGeneralSettings(general);
    setOrgInfo(currentOrgInfo);
    setIntegrations(currentIntegrations);
    setMobileConfig(currentMobileConfig);
    setPermissions(currentPermissions);
    setSettingsConflict(false);
  }, [settings]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        generalSettings,
        orgInfo,
        integrations,
        mobileConfig,
        permissions,
      });
      if (SUPABASE_SYSTEM_SETTINGS && generalSettings.timezone !== user?.tenantTimeZone) {
        try {
          await refreshProfile();
        } catch {
          showToast('Pengaturan tersimpan. Muat ulang sesi agar zona waktu Tahfidz diperbarui.', 'info');
          return;
        }
      }
      showToast('Konfigurasi sistem berhasil disimpan dan disinkronkan secara realtime!', 'success');
    } catch (err: any) {
      console.error(err);
      if (err?.status === 409) setSettingsConflict(true);
      showToast(err.message || 'Gagal menyimpan pengaturan ke database.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Safe image compressor without window.alert
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'faviconUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("Ukuran file maksimal 2MB. Gambar akan otomatis dioptimasi.", "info");
    }

    try {
      const compressedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = field === 'faviconUrl' ? 64 : 240;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(event.target?.result as string);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png', 0.85));
          };
          img.onerror = reject;
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setOrgInfo(prev => ({
        ...prev,
        [field]: compressedDataUrl
      }));
      showToast(`Gambar ${field === 'logoUrl' ? 'Logo' : 'Favicon'} berhasil diproses dan dioptimasi.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal memproses file gambar. Pastikan format adalah PNG atau JPG.', 'error');
    }
  };

  const togglePermission = (role: UserRole, moduleId: ModuleId) => {
    if (role === 'SuperAdmin') return;
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [moduleId]: !prev[role]?.[moduleId]
      }
    }));
  };

  const setAllPermissionsForRole = (role: UserRole, grant: boolean) => {
    if (role === 'SuperAdmin') return;
    const newRolePerms: Record<string, boolean> = {};
    ALL_MODULE_LIST.forEach(m => {
      newRolePerms[m.id] = grant;
    });
    setPermissions(prev => ({
      ...prev,
      [role]: newRolePerms
    }));
    showToast(`${grant ? 'Memberikan' : 'Mencabut'} semua hak akses modul untuk role ${role}.`, 'info');
  };

  const handleDownloadBackup = () => {
    try {
      const data = exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pesantren-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('File backup konfigurasi sistem berhasil diunduh.', 'success');
    } catch (e: any) {
      showToast('Gagal membuat file backup: ' + e.message, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={cn(
            "fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 animate-in slide-in-from-top-3",
            toast.type === 'success' && "bg-emerald-950/90 border-emerald-500/40 text-emerald-200",
            toast.type === 'error' && "bg-rose-950/90 border-rose-500/40 text-rose-200",
            toast.type === 'info' && "bg-indigo-950/90 border-indigo-500/40 text-indigo-200"
          )}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <AlertTriangle className="w-5 h-5 text-indigo-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {SUPABASE_SYSTEM_SETTINGS && !settingsReady && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              {settingsLoadError ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /> : <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-indigo-500" />}
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">{settingsLoadError ? "Pengaturan belum dapat dimuat" : "Memuat pengaturan tenant"}</h2>
                <p role={settingsLoadError ? "alert" : "status"} className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {settingsLoadError || "Pengaturan dari Supabase sedang dimuat. Form dikunci sampai data tenant diterima agar nilai awal tidak menimpa konfigurasi tersimpan."}
                </p>
                {settingsLoadError && <button type="button" onClick={retrySettingsLoad} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Coba lagi</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-indigo-500 pb-1 inline-block">
              Pengaturan & Konfigurasi Pusat
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Sinkronisasi Langsung Aktif
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-2">
            Kelola identitas institusi, kalender akademik, hak akses dinamis (RBAC), integrasi layanan, dan konfigurasi portal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSaveAll}
            disabled={isSaving || !settingsReady || settingsConflict}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>

      {settingsConflict && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Pengaturan sudah diubah oleh Admin lain. Perubahan Anda belum disimpan; muat ulang data terbaru sebelum mengedit kembali.</p>
          <button type="button" onClick={retrySettingsLoad} className="shrink-0 rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30">Muat ulang pengaturan</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 border-r border-slate-200 dark:border-white/5 pr-4">
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'general', label: 'Umum & Kalender', icon: <Globe className="w-4 h-4" /> },
              { id: 'organization', label: 'Profil Institusi', icon: <Building className="w-4 h-4" /> },
              { id: 'security', label: 'Peran & Matriks RBAC', icon: <Shield className="w-4 h-4" /> },
              { id: 'integrations', label: 'Integrasi API & Layanan', icon: <Database className="w-4 h-4" /> },
              { id: 'mobile', label: 'Portal Wali & Santri', icon: <Smartphone className="w-4 h-4" /> },
              { id: 'backup', label: 'Cadangan & Utilitas Basis Data', icon: <Download className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn("erp-tab-control", 
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left",
                  activeTab === tab.id 
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Info Box */}
          <div className="mt-8 p-4 rounded-xl bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-xs space-y-2 text-slate-500">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Periode Aktif Terpusat</div>
            <div className="text-emerald-500 font-medium">T.A. {generalSettings.academicYear} - {generalSettings.semester}</div>
            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200 dark:border-white/5">
              Perubahan langsung berdampak pada modul Akademik, Rapor, CBT, dan Keuangan.
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="md:col-span-3">
          <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
            
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-indigo-400" /> Pengaturan Umum & Kalender Akademik
                  </h2>
                  <p className="text-xs text-slate-500">
                    Parameter umum sistem yang menjadi acuan default untuk seluruh modul aplikasi.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Tema Tampilan Sistem
                    </label>
                    <select 
                      value={generalSettings.theme || 'dark'}
                      onChange={e => setGeneralSettings({...generalSettings, theme: e.target.value as any})}
                      className="w-full glass-card rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="dark">Dark Mode (Default)</option>
                      <option value="light">Light Mode</option>
                      <option value="system">Ikuti Pengaturan Perangkat (Sinkronisasi Otomatis)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Tahun Ajaran Aktif Terpusat
                    </label>
                    <input 
                      type="text" 
                      value={generalSettings.academicYear}
                      onChange={e => setGeneralSettings({...generalSettings, academicYear: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="e.g. 2026/2027"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Acuan tahun ajaran pada leger rapor, CBT, dan tagihan SPP.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Semester Berjalan
                    </label>
                    <select 
                      value={generalSettings.semester}
                      onChange={e => setGeneralSettings({...generalSettings, semester: e.target.value as any})}
                      className="w-full glass-card rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="Ganjil">Semester Ganjil (Gasal)</option>
                      <option value="Genap">Semester Genap</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Bahasa Utama Antarmuka
                    </label>
                    <select 
                      value={generalSettings.language}
                      onChange={e => setGeneralSettings({...generalSettings, language: e.target.value as any})}
                      className="w-full glass-card rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="id">Bahasa Indonesia (ID)</option>
                      <option value="en">English (US)</option>
                      <option value="ar">العربية (Arabic)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Zona Waktu Pesantren (Tahfidz & Operasional)
                    </label>
                    <select 
                      value={generalSettings.timezone}
                      onChange={e => setGeneralSettings({...generalSettings, timezone: e.target.value as any})}
                      className="w-full glass-card rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="Asia/Jakarta">WIB - Asia/Jakarta (UTC+7)</option>
                      <option value="Asia/Makassar">WITA - Asia/Makassar (UTC+8)</option>
                      <option value="Asia/Jayapura">WIT - Asia/Jayapura (UTC+9)</option>
                    </select>
                  </div>

                  {/* Kunci E-Rapor Semester */}
                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Status Penguncian Nilai & E-Rapor
                    </label>
                    <button
                      type="button"
                      onClick={() => setGeneralSettings({
                        ...generalSettings,
                        isReportCardLocked: !generalSettings.isReportCardLocked
                      })}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        generalSettings.isReportCardLocked 
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-300" 
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {generalSettings.isReportCardLocked ? <Lock className="w-4 h-4 text-rose-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                        {generalSettings.isReportCardLocked ? "Terkunci (Final Semester)" : "Terbuka (Input Nilai Aktif)"}
                      </span>
                      <span className="text-xs opacity-75">Klik untuk {generalSettings.isReportCardLocked ? 'Buka Kunci' : 'Kunci Rapor'}</span>
                    </button>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Bila terkunci, guru dan pengajar di modul Akademik tidak dapat mengubah nilai rapor semester ini.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Organization Info */}
            {activeTab === 'organization' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-400" /> Profil & Legalitas Institusi
                  </h2>
                  <p className="text-xs text-slate-500">
                    Data resmi pesantren untuk kop dokumen, invoice pembayaran, sertifikat tahfidz, dan laporan.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nama Resmi Pondok Pesantren / Yayasan</label>
                    <input 
                      type="text" 
                      value={orgInfo.schoolName}
                      onChange={e => setOrgInfo({...orgInfo, schoolName: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nomor Telepon Kantor</label>
                    <input 
                      type="text" 
                      value={orgInfo.phone}
                      onChange={e => setOrgInfo({...orgInfo, phone: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Email Resmi Sekretariat</label>
                    <input 
                      type="email" 
                      value={orgInfo.email}
                      onChange={e => setOrgInfo({...orgInfo, email: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Alamat Lengkap Pesantren</label>
                    <textarea 
                      rows={2}
                      value={orgInfo.address}
                      onChange={e => setOrgInfo({...orgInfo, address: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nama Pimpinan / Mudir Pesantren</label>
                    <input 
                      type="text" 
                      value={orgInfo.principalName}
                      onChange={e => setOrgInfo({...orgInfo, principalName: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Website Resmi</label>
                    <input 
                      type="url" 
                      value={orgInfo.website}
                      onChange={e => setOrgInfo({...orgInfo, website: e.target.value})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {/* Branding & Logo */}
                  <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-200 dark:border-white/10">
                    <h3 className="text-md font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-400" /> Branding, Logo & Favicon
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Logo Header & Laporan</label>
                        <div className="flex items-center gap-3">
                          {orgInfo.logoUrl ? (
                            <img src={orgInfo.logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded-lg border border-white/10 bg-black/20 p-1" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-dashed border-slate-600 flex items-center justify-center text-slate-500">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="flex-1 flex gap-2">
                            <input 
                              type="text" 
                              value={orgInfo.logoUrl}
                              onChange={e => setOrgInfo({...orgInfo, logoUrl: e.target.value})}
                              placeholder="URL atau pilih berkas..."
                              className="flex-1 glass-card rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                            />
                            <label className="flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-2 cursor-pointer hover:bg-indigo-500/20 transition-colors text-xs font-medium">
                              <Upload className="w-3.5 h-3.5 mr-1" />
                              <span>Unggah</span>
                              <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logoUrl')} className="hidden" />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Favicon Tab Browser</label>
                        <div className="flex items-center gap-3">
                          {orgInfo.faviconUrl ? (
                            <img src={orgInfo.faviconUrl} alt="Favicon" className="w-10 h-10 object-contain rounded-lg border border-white/10 bg-black/20 p-1" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-dashed border-slate-600 flex items-center justify-center text-slate-500">
                              <Sparkles className="w-4 h-4" />
                            </div>
                          )}
                          <div className="flex-1 flex gap-2">
                            <input 
                              type="text" 
                              value={orgInfo.faviconUrl}
                              onChange={e => setOrgInfo({...orgInfo, faviconUrl: e.target.value})}
                              placeholder="URL atau pilih berkas..."
                              className="flex-1 glass-card rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                            />
                            <label className="flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg px-3 py-2 cursor-pointer hover:bg-indigo-500/20 transition-colors text-xs font-medium">
                              <Upload className="w-3.5 h-3.5 mr-1" />
                              <span>Unggah</span>
                              <input type="file" accept="image/x-icon,image/png" onChange={(e) => handleFileUpload(e, 'faviconUrl')} className="hidden" />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Format Judul Tab Browser (Window Title)</label>
                        <input 
                          type="text" 
                          value={orgInfo.pageTitleFormat}
                          onChange={e => setOrgInfo({...orgInfo, pageTitleFormat: e.target.value})}
                          placeholder="Pesantren OS | {schoolName}"
                          className="w-full glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <p className="text-xs text-slate-500 mt-1">Gunakan tag {'{schoolName}'} sebagai placeholder nama institusi.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic RBAC & Matrix */}
            {activeTab === 'security' && (
              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-indigo-400" /> Matriks Hak Akses Dinamis (Dynamic RBAC)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Konfigurasi hak akses modul per-role. Perubahan langsung mengatur navigasi Sidebar dan proteksi halaman.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03]">
                        <th className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-100 dark:bg-[#0a0a0a] z-10 w-64 border-r border-slate-200 dark:border-white/5">
                          Modul Aplikasi ({ALL_MODULE_LIST.length})
                        </th>
                        {SYSTEM_ROLES.map(role => (
                          <th key={role} className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-center">
                            <div>{role}</div>
                            {role !== 'SuperAdmin' && (
                              <div className="flex items-center justify-center gap-1 mt-1 font-normal text-[10px] lowercase">
                                <button 
                                  type="button" 
                                  onClick={() => setAllPermissionsForRole(role, true)}
                                  className="text-emerald-400 hover:underline"
                                >
                                  semua
                                </button>
                                <span>/</span>
                                <button 
                                  type="button" 
                                  onClick={() => setAllPermissionsForRole(role, false)}
                                  className="text-rose-400 hover:underline"
                                >
                                  cabut
                                </button>
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                      {ALL_MODULE_LIST.map((mdl) => (
                        <tr key={mdl.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 text-sm font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-[#0a0a0a] border-r border-slate-200 dark:border-white/5 z-10 w-64">
                            <div className="flex items-center justify-between">
                              <span>{mdl.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                                {mdl.category}
                              </span>
                            </div>
                          </td>
                          {SYSTEM_ROLES.map((role) => {
                            const isSuperAdmin = role === 'SuperAdmin';
                            const hasAccess = isSuperAdmin ? true : !!permissions[role]?.[mdl.id];
                            return (
                              <td key={`${role}-${mdl.id}`} className="p-3 text-center">
                                <button
                                  type="button"
                                  disabled={isSuperAdmin}
                                  onClick={() => togglePermission(role, mdl.id)}
                                  className={cn(
                                    "inline-flex items-center justify-center p-1.5 rounded-lg transition-all",
                                    hasAccess 
                                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600" 
                                      : "bg-slate-200 dark:bg-white/5 text-slate-400 hover:bg-slate-300 dark:hover:bg-white/10 hover:text-slate-200",
                                    isSuperAdmin && "opacity-60 cursor-not-allowed"
                                  )}
                                  title={isSuperAdmin ? "SuperAdmin memiliki hak akses penuh" : `${hasAccess ? 'Cabut' : 'Beri'} akses ${mdl.name} untuk ${role}`}
                                >
                                  {hasAccess ? <Check className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* API Integrations */}
            {activeTab === 'integrations' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" /> Integrasi Gateway & Komunikasi Otomatis
                  </h2>
                  <p className="text-xs text-slate-500">
                    Konfigurasi kunci API untuk pengiriman pesan WhatsApp massal, payment gateway SPP, dan server email.
                  </p>
                </div>

                {/* WhatsApp Gateway Card */}
                <div className="p-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Send className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Integrasi WhatsApp (Notifikasi Wali & Pengajar)</h3>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">Rahasia server-side</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Token WhatsApp tidak lagi dimasukkan atau disimpan di browser maupun Firestore. Simpan sebagai secret server bernama <code>WA_GATEWAY_API_KEY</code> pada Cloud Run Secret Manager.</p>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Alamat URL API</label>
                    <input
                      type="url"
                      value={integrations.waGatewayEndpoint || ''}
                      onChange={e => setIntegrations({...integrations, waGatewayEndpoint: e.target.value})}
                      placeholder="https://api.whatsapp-gateway.com/v1/send"
                      className="w-full glass-card rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-950/40 p-3 text-xs text-slate-500 dark:text-slate-400">
                    Pengiriman dan uji koneksi WhatsApp belum aktif sampai backend gateway dikonfigurasi. Status tidak disimulasikan sebagai koneksi berhasil.
                  </div>
                </div>

                {/* Payment Gateway Card */}
                <div className="p-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Gerbang Pembayaran (VA, QRIS, & Kartu Pembayaran)</h3>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">Belum terhubung</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Penyedia Layanan</label>
                    <select
                      value={integrations.paymentGatewayProvider || 'midtrans'}
                      onChange={e => setIntegrations({...integrations, paymentGatewayProvider: e.target.value as any})}
                      className="w-full glass-card rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                    >
                      <option value="midtrans">Pembayaran Midtrans (Snap & Core API)</option>
                      <option value="xendit">Xendit Invoice & XenPlatform</option>
                    </select>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-950/40 p-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <p>Jangan masukkan Server Key di sini. Simpan sebagai secret server bernama <code>PAYMENT_GATEWAY_SECRET_KEY</code> di Cloud Run Secret Manager.</p>
                    <p>Pembuatan transaksi melalui layanan pembayaran dan uji koneksi belum tersedia di backend; pilihan penyedia hanya mengatur konfigurasi, bukan bukti koneksi.</p>
                  </div>
                </div>

                {/* SMTP Email Server */}
                <div className="p-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] space-y-4">
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Server SMTP (Email Keluar)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">SMTP Host</label>
                      <input 
                        type="text" 
                        value={integrations.smtpHost}
                        onChange={e => setIntegrations({...integrations, smtpHost: e.target.value})}
                        className="w-full glass-card rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">SMTP Port</label>
                      <input 
                        type="text" 
                        value={integrations.smtpPort}
                        onChange={e => setIntegrations({...integrations, smtpPort: e.target.value})}
                        className="w-full glass-card rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sender Email</label>
                      <input 
                        type="text" 
                        value={integrations.smtpUser || ''}
                        onChange={e => setIntegrations({...integrations, smtpUser: e.target.value})}
                        placeholder="noreply@pesantren.sch.id"
                        className="w-full glass-card rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Parent Mobile App Config */}
            {activeTab === 'mobile' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-indigo-400" /> Konfigurasi Portal Wali Santri & Aplikasi Seluler
                  </h2>
                  <p className="text-xs text-slate-500">
                    Atur transparansi nilai dan fitur mandiri yang dapat diakses oleh Wali Santri.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={mobileConfig.showDetailedGrades}
                      onChange={e => setMobileConfig({...mobileConfig, showDetailedGrades: e.target.checked})}
                      className="w-5 h-5 rounded border-slate-600 bg-black/20 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">Tampilkan Rincian Nilai Mata Pelajaran ke Wali Santri</div>
                      <div className="text-xs text-slate-500">Izinkan wali santri melihat nilai ulangan harian & rincian tugas vs hanya nilai rapor akhir.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={mobileConfig.allowLeaveRequests}
                      onChange={e => setMobileConfig({...mobileConfig, allowLeaveRequests: e.target.checked})}
                      className="w-5 h-5 rounded border-slate-600 bg-black/20 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">Aktifkan Pengajuan Izin Kepulangan Santri Mandiri</div>
                      <div className="text-xs text-slate-500">
                        Bila dinonaktifkan, formulir pengajuan izin santri di Communication Hub akan ditutup sementara oleh sistem.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={mobileConfig.pushNotifications}
                      onChange={e => setMobileConfig({...mobileConfig, pushNotifications: e.target.checked})}
                      className="w-5 h-5 rounded border-slate-600 bg-black/20 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">Notifikasi Otomatis ke Ponsel Wali</div>
                      <div className="text-xs text-slate-500">Kirim notifikasi instan saat setoran hafalan baru dicatat atau perizinan disetujui musyrif.</div>
                    </div>
                  </label>

                  <div className="pt-4 border-t border-slate-200 dark:border-white/5 mt-4">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Nomor Hotline CS / WhatsApp Helpdesk Pesantren
                    </label>
                    <input 
                      type="text" 
                      value={mobileConfig.supportWhatsapp}
                      onChange={e => setMobileConfig({...mobileConfig, supportWhatsapp: e.target.value})}
                      className="w-full max-w-md glass-card rounded-lg px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none"
                      placeholder="e.g. +62 812 3456 7890"
                    />
                    <p className="text-xs text-slate-500 mt-1">Nomor ini menjadi tautan otomatis tombol "Bantuan & CS" di portal wali santri.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Backup & System Utility */}
            {activeTab === 'backup' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Download className="w-5 h-5 text-indigo-400" /> Backup & Utilitas Database Sistem
                  </h2>
                  <p className="text-xs text-slate-500">
                    Unduh snapshot data konfigurasi sistem dan periksa integritas dokumen database.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] space-y-3">
                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" /> Ekspor Snapshot Konfigurasi (JSON)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Unduh arsip lengkap pengaturan sistem termasuk profil institusi, kalender akademik, matriks RBAC, dan integrasi API.
                    </p>
                    <button
                      type="button"
                      onClick={handleDownloadBackup}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh Cadangan JSON</span>
                    </button>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] space-y-3">
                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" /> Ringkasan Status Sistem
                    </h3>
                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span>Basis Data Tujuan:</span>
                        <span className="font-mono text-emerald-400">{SUPABASE_SYSTEM_SETTINGS ? 'Supabase (tenant_settings)' : 'Firestore (settings/global)'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span>Modul Terdaftar:</span>
                        <span className="font-medium text-slate-300">{ALL_MODULE_LIST.length} Modul</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span>Peran Sistem:</span>
                        <span className="font-medium text-slate-300">{SYSTEM_ROLES.length} Peran Pengguna</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Pembaruan Terakhir:</span>
                        <span className="text-slate-400">{settings.updatedAt ? new Date(settings.updatedAt).toLocaleString('id-ID') : 'Default Awal'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {role === 'SuperAdmin' && SUPABASE_SYSTEM_SETTINGS_IMPORT && (
                  <section className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3" aria-labelledby="settings-import-title">
                    <div>
                      <h3 id="settings-import-title" className="font-semibold text-sm text-slate-800 dark:text-slate-200">Migrasi Pengaturan Tenant dari Firestore</h3>
                      <p className="text-xs text-slate-500 mt-1">Pratinjau membaca data sumber pesantren aktif dan mengabaikan kolom kredensial. Terapkan hanya setelah memeriksa nama pesantren dan tahun ajaran.</p>
                    </div>
                    {settingsMigrationError && <p role="alert" className="text-xs text-rose-500">{settingsMigrationError}</p>}
                    {settingsMigrationReport && (
                      <div className="rounded-lg bg-slate-100 dark:bg-black/20 p-3 text-xs space-y-1">
                        <p>Sumber ditemukan: <strong>{settingsMigrationReport.sourceExists ? 'Ya' : 'Tidak; snapshot kosong'}</strong></p>
                        <p>Pesantren: <strong>{settingsMigrationReport.settings?.orgInfo?.schoolName || '—'}</strong></p>
                        <p>Tahun ajaran: <strong>{settingsMigrationReport.settings?.generalSettings?.academicYear || '—'}</strong></p>
                        <p className="break-all text-slate-500">Sidik digital: {settingsMigrationReport.previewFingerprint}</p>
                        {settingsMigrationReport.alreadyImported && <p className="text-emerald-600">Data sumber ini sudah pernah diimpor.</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void runSettingsMigration(false)} disabled={settingsMigrationBusy} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 text-xs font-medium disabled:opacity-50">
                        {settingsMigrationBusy ? 'Memeriksa…' : 'Pratinjau data sumber'}
                      </button>
                      <button type="button" onClick={() => void runSettingsMigration(true)} disabled={settingsMigrationBusy || !settingsMigrationReport?.previewFingerprint || settingsMigrationReport?.alreadyImported} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-50">
                        {settingsMigrationBusy ? 'Memproses…' : 'Terapkan snapshot yang ditinjau'}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
