import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { 
  UserRole, 
  ROLE_MODULES, 
  PLATFORM_ONLY_MODULES, 
  TENANT_SCOPED_MODULES, 
  isModuleAccessible, 
  getAllowedModulesForUser 
} from '../rbac';
import { ALL_MODULE_LIST } from '../services/systemSettingsService';
import { ModuleId } from '../types';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Key, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Edit3, 
  Lock, 
  Eye, 
  EyeOff, 
  Copy, 
  ExternalLink,
  ShieldAlert,
  ServerOff,
  UserCheck,
  UserX,
  Sparkles,
  Building2
} from 'lucide-react';

interface UserRecord {
  uid: string;
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  status: 'active' | 'disabled' | 'inactive';
  tenantId: string;
  tenantName: string;
  mustChangePassword?: boolean;
  modulePermissions?: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
  linkedSantriId?: string;
  linkedSantriName?: string;
  linkedSantriNis?: string;
}

export function UserManagementView() {
  const { user: currentActor, role: currentRole } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [backendErrorCode, setBackendErrorCode] = useState<string | null>(null);
  const [isSdkUnavailable, setIsSdkUnavailable] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  // Form states for creation
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('Ustadz');
  const [createTempPassword, setCreateTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createPermissions, setCreatePermissions] = useState<Record<string, boolean>>({});
  const [createLinkedName, setCreateLinkedName] = useState('');
  const [createLinkedNis, setCreateLinkedNis] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form states for editing
  const [editRole, setEditRole] = useState<UserRole>('Ustadz');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset password state
  const [resetFeedback, setResetFeedback] = useState<{ uid: string; message: string; link?: string } | null>(null);

  // Initialize permissions default when role changes in create modal
  useEffect(() => {
    const perms: Record<string, boolean> = {};
    ALL_MODULE_LIST.forEach((m) => {
      perms[m.id] = isModuleAccessible(createRole, m.id, null);
    });
    setCreatePermissions(perms);
  }, [createRole]);

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateTempPassword(result);
  };

  const fetchUsers = useCallback(async () => {
    if (!currentActor) return;
    setIsLoading(true);
    setErrorBanner(null);
    setBackendErrorCode(null);
    setIsSdkUnavailable(false);

    try {
      if (!auth.currentUser) throw new Error('Pengguna belum terautentikasi.');
      const token = await auth.currentUser.getIdToken();

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (roleFilter !== 'ALL') params.append('role', roleFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setIsSdkUnavailable(true);
        setBackendErrorCode(data.code || 'ADMIN_SDK_UNAVAILABLE');
        setErrorBanner(data.error || 'Layanan Firebase Admin SDK / Firestore Store tidak tersedia.');
        setUsers([]);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIsSdkUnavailable(false);
        setBackendErrorCode(data.code || 'REQUEST_FAILED');
        throw new Error(data.error || 'Gagal memuat daftar pengguna tenant.');
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setErrorBanner(err.message || 'Gagal menghubungi server untuk memuat pengguna.');
    } finally {
      setIsLoading(false);
    }
  }, [currentActor, searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreateUsername('');
    // If actor is Admin, default role is Ustadz (Admin cannot create Admin/SuperAdmin)
    setCreateRole('Ustadz');
    setCreateTempPassword('');
    setCreateLinkedName('');
    setCreateLinkedNis('');
    setCreateError(null);
    generateRandomPassword();
    setIsCreateModalOpen(true);
  };

  // Submit Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (createTempPassword.length < 12) {
      setCreateError('Kata sandi sementara harus minimal 12 karakter.');
      return;
    }

    // Role privilege check
    if (currentRole === 'Admin' && (createRole === 'SuperAdmin' || createRole === 'Admin')) {
      setCreateError('Admin tidak memiliki wewenang untuk membuat akun Admin atau SuperAdmin.');
      return;
    }

    setIsCreating(true);
    try {
      if (!auth.currentUser) throw new Error('Pengguna belum login.');
      const token = await auth.currentUser.getIdToken();

      const finalPerms = createRole === 'SuperAdmin'
        ? ALL_MODULE_LIST.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
        : { ...createPermissions };
      if (currentRole === 'Admin') {
        finalPerms['settings'] = false;
      }

      const payload = {
        name: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        username: createUsername.trim() || undefined,
        role: createRole,
        tempPassword: createTempPassword,
        modulePermissions: finalPerms,
        linkedSantriName: createLinkedName.trim() || undefined,
        linkedSantriNis: createLinkedNis.trim() || undefined,
      };

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 503) {
        setIsSdkUnavailable(true);
        throw new Error(data.error || 'Firebase Admin SDK credentials are not configured in preview.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat pengguna baru.');
      }

      setIsCreateModalOpen(false);
      setActionSuccessMessage(`Pengguna "${createName}" berhasil dibuat dengan status mustChangePassword=true.`);
      setTimeout(() => setActionSuccessMessage(null), 5000);
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message || 'Terjadi kesalahan saat membuat pengguna.');
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (targetUser: UserRecord) => {
    setEditingUser(targetUser);
    setEditRole(targetUser.role);
    setEditStatus(targetUser.status === 'active' ? 'active' : 'disabled');
    
    // Set existing permissions or default
    const existingPerms: Record<string, boolean> = {};
    ALL_MODULE_LIST.forEach((m) => {
      existingPerms[m.id] = isModuleAccessible(targetUser.role, m.id, targetUser.modulePermissions);
    });
    setEditPermissions(existingPerms);
    setEditError(null);
  };

  // Submit Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    // Self demote & disable checks
    if (editingUser.uid === currentActor?.uid) {
      if (editStatus !== 'active') {
        setEditError('Anda tidak dapat menonaktifkan akun Anda sendiri.');
        return;
      }
      if (editRole !== currentRole) {
        setEditError('Anda tidak dapat mengubah role akun Anda sendiri.');
        return;
      }
    }

    // Admin hierarchy check
    if (currentRole === 'Admin') {
      if (editingUser.role === 'SuperAdmin' || (editingUser.role === 'Admin' && editingUser.uid !== currentActor?.uid)) {
        setEditError('Admin tidak berwenang mengedit akun SuperAdmin atau Admin lainnya.');
        return;
      }
      if (editRole === 'SuperAdmin' || editRole === 'Admin') {
        setEditError('Hanya SuperAdmin yang dapat mengangkat role Admin atau SuperAdmin.');
        return;
      }
    }

    setIsUpdating(true);
    try {
      if (!auth.currentUser) throw new Error('Pengguna belum login.');
      const token = await auth.currentUser.getIdToken();

      const finalPerms = editRole === 'SuperAdmin'
        ? ALL_MODULE_LIST.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
        : { ...editPermissions };
      if (currentRole === 'Admin') {
        finalPerms['settings'] = false;
      }

      const payload = {
        role: editRole,
        status: editStatus,
        modulePermissions: finalPerms,
      };

      const res = await fetch(`/api/users/${editingUser.uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 503) {
        throw new Error(data.error || 'Firebase Admin SDK credentials are not configured in preview.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal memperbarui data pengguna.');
      }

      setEditingUser(null);
      setActionSuccessMessage(`Pengguna "${editingUser.name}" berhasil diperbarui.`);
      setTimeout(() => setActionSuccessMessage(null), 5000);
      fetchUsers();
    } catch (err: any) {
      setEditError(err.message || 'Terjadi kesalahan saat memperbarui pengguna.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Send Reset Password Email
  const handleResetPassword = async (targetUser: UserRecord) => {
    if (!confirm(`Kirim tautan reset kata sandi ke email ${targetUser.email}?`)) {
      return;
    }

    try {
      if (!auth.currentUser) throw new Error('Pengguna belum login.');
      const token = await auth.currentUser.getIdToken();

      const res = await fetch(`/api/users/${targetUser.uid}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 503) {
        alert(data.error || 'Firebase Admin SDK credentials unavailable in this preview environment.');
        return;
      }

      if (!res.ok) {
        alert(data.error || 'Gagal memproses reset kata sandi.');
        return;
      }

      setResetFeedback({
        uid: targetUser.uid,
        message: data.message || 'Tautan reset kata sandi berhasil disiapkan.',
        link: data.resetLink,
      });
      setActionSuccessMessage(`Tautan reset kata sandi berhasil dibuat untuk ${targetUser.email}.`);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Gagal mengirim reset password.');
    }
  };

  // Toggle active/disable directly
  const handleToggleStatus = async (targetUser: UserRecord) => {
    if (targetUser.uid === currentActor?.uid) {
      alert('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      return;
    }

    if (currentRole === 'Admin' && (targetUser.role === 'SuperAdmin' || targetUser.role === 'Admin')) {
      alert('Admin tidak memiliki izin mengubah status SuperAdmin atau sesama Admin.');
      return;
    }

    const nextStatus = targetUser.status === 'active' ? 'disabled' : 'active';
    const confirmText = nextStatus === 'disabled'
      ? `Apakah Anda yakin ingin menonaktifkan akun ${targetUser.name}? Pengguna ini tidak akan dapat masuk ke sistem.`
      : `Aktifkan kembali akun ${targetUser.name}?`;

    if (!confirm(confirmText)) return;

    try {
      if (!auth.currentUser) throw new Error('Pengguna belum login.');
      const token = await auth.currentUser.getIdToken();

      const res = await fetch(`/api/users/${targetUser.uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Gagal mengubah status pengguna.');
        return;
      }

      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status pengguna.');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'SuperAdmin':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">Super Admin</span>;
      case 'Admin':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Admin</span>;
      case 'Ustadz':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">Ustadz/Staff</span>;
      case 'Santri':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Santri</span>;
      case 'Walisantri':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">Wali Santri</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-500/10 text-slate-400 border border-slate-500/20">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Manajemen Pengguna & Akses</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" />
              Tenant: {currentActor?.tenantName || currentActor?.tenantId || 'Terisolasi'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola akun staf, santri, dan wali santri dengan isolasi tenant dan pembatasan hak akses modul per pengguna.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchUsers()}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-2"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Pengguna</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Error / SDK Warning Banner */}
      {isSdkUnavailable && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <ServerOff className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              {backendErrorCode === 'ADMIN_PROFILE_STORE_UNAVAILABLE'
                ? 'Layanan Penyimpanan Profil Admin (Firestore) Belum Tersedia'
                : 'Kredensial Firebase Admin SDK Belum Terpasang di Server'}
            </span>
          </div>
          <p className="leading-relaxed">
            {errorBanner}
          </p>
          <div className="p-3 bg-black/10 dark:bg-black/30 rounded-lg font-mono text-[11px] leading-relaxed space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Panduan Konfigurasi IAM Backend (Google Cloud Console):</div>
            <div>1. Berikan IAM Role <strong>Cloud Datastore User</strong> (<code>roles/datastore.user</code>) dan <strong>Firebase Authentication Admin</strong> pada Service Account backend Cloud Run.</div>
            <div>2. Pastikan target database Firestore (<code>ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8</code>) aktif pada GCP project <code>graphite-ship-q5xj8</code>.</div>
            <div>3. Untuk lingkungan runtime lokal: pasang variabel <code>GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json</code>.</div>
          </div>
        </div>
      )}

      {errorBanner && !isSdkUnavailable && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-semibold">{errorBanner}</div>
            {backendErrorCode && (
              <div className="text-[11px] font-mono text-red-500/80">Kode: {backendErrorCode}</div>
            )}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, email, atau username pengguna..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Role</option>
            <option value="SuperAdmin">Super Admin</option>
            <option value="Admin">Admin</option>
            <option value="Ustadz">Ustadz/Staff</option>
            <option value="Santri">Santri</option>
            <option value="Walisantri">Wali Santri</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="disabled">Dinonaktifkan</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-panel rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Pengguna</th>
                <th className="py-3 px-4">Role & Hak Akses</th>
                <th className="py-3 px-4">Status & Keamanan</th>
                <th className="py-3 px-4">Modul Aktif</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                      <span>Memuat data pengguna tenant...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <div>Tidak ada pengguna ditemukan.</div>
                    {isSdkUnavailable && (
                      <p className="text-[11px] text-amber-500/80 mt-1">
                        Backend memerlukan konfigurasi Application Default Credentials (ADC) dan IAM role Cloud Datastore User untuk membaca data Firestore.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                users.map((item) => {
                  const isCurrentActor = item.uid === currentActor?.uid;
                  const activeModulesCount = ALL_MODULE_LIST.filter((m) =>
                    isModuleAccessible(item.role, m.id, item.modulePermissions)
                  ).length;

                  return (
                    <tr key={item.uid} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-slate-700 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                            {item.name ? item.name.substring(0, 2) : 'US'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {isCurrentActor && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  Akun Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" />
                              <span>{item.email}</span>
                            </div>
                            {item.linkedSantriName && (
                              <div className="text-[10px] text-cyan-500 mt-0.5">
                                Terhubung Santri: {item.linkedSantriName} {item.linkedSantriNis ? `(${item.linkedSantriNis})` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role & Hak Akses */}
                      <td className="py-3.5 px-4">
                        <div>
                          {getRoleBadge(item.role)}
                          <div className="text-[10px] text-slate-400 mt-1">
                            Tenant: <span className="font-mono">{item.tenantName || item.tenantId}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status & Password Flag */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {item.status === 'active' ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Aktif</span>
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-slate-400" />
                                <span className="text-slate-400 font-semibold text-[11px]">Dinonaktifkan</span>
                              </>
                            )}
                          </div>

                          {item.mustChangePassword ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                              <Key className="w-2.5 h-2.5" />
                              <span>Wajib Ganti Password</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Password telah diatur</div>
                          )}
                        </div>
                      </td>

                      {/* Module Permissions Count */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{activeModulesCount}</span>
                          <span className="text-slate-400 text-[11px]">/ {ALL_MODULE_LIST.length} modul</span>
                        </div>
                        {item.role === 'SuperAdmin' && (
                          <div className="text-[10px] text-purple-400">Akses Penuh (Tak Terbatas)</div>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            disabled={currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))}
                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-white/10 transition-colors ${
                              currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))
                                ? 'opacity-30 cursor-not-allowed text-slate-400'
                                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300'
                            }`}
                            title={
                              currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))
                                ? 'Admin tidak berwenang mengedit akun SuperAdmin atau Admin lainnya'
                                : 'Edit Role & Hak Akses Modul'
                            }
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Reset Password Button */}
                          <button
                            onClick={() => handleResetPassword(item)}
                            disabled={currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))}
                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-white/10 transition-colors ${
                              currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))
                                ? 'opacity-30 cursor-not-allowed text-slate-400'
                                : 'hover:bg-amber-500/10 text-slate-600 dark:text-slate-300 hover:text-amber-500'
                            }`}
                            title={
                              currentRole === 'Admin' && (item.role === 'SuperAdmin' || (item.role === 'Admin' && !isCurrentActor))
                                ? 'Admin tidak berwenang mereset kata sandi akun SuperAdmin atau Admin lainnya'
                                : 'Kirim Tautan Reset Password'
                            }
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active/Disabled */}
                          <button
                            onClick={() => handleToggleStatus(item)}
                            disabled={isCurrentActor || (currentRole === 'Admin' && (item.role === 'SuperAdmin' || item.role === 'Admin'))}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isCurrentActor || (currentRole === 'Admin' && (item.role === 'SuperAdmin' || item.role === 'Admin'))
                                ? 'opacity-30 cursor-not-allowed border-slate-200 dark:border-white/5 text-slate-400'
                                : item.status === 'active'
                                  ? 'border-red-500/20 hover:bg-red-500/10 text-red-500'
                                  : 'border-emerald-500/20 hover:bg-emerald-500/10 text-emerald-500'
                            }`}
                            title={
                              isCurrentActor
                                ? 'Tidak dapat menonaktifkan akun sendiri'
                                : currentRole === 'Admin' && (item.role === 'SuperAdmin' || item.role === 'Admin')
                                  ? 'Admin tidak dapat mengubah akun Admin/SuperAdmin'
                                  : item.status === 'active' ? 'Nonaktifkan Akun' : 'Aktifkan Akun'
                            }
                          >
                            {item.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5 text-emerald-400" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden my-8">
            <div className="p-6 bg-gradient-to-r from-emerald-950 to-slate-900 text-white flex items-center justify-between border-b border-emerald-800/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Tambah Pengguna Baru</h3>
                  <p className="text-xs text-slate-300">
                    Tenant: <strong>{currentActor?.tenantName || currentActor?.tenantId}</strong> (Otomatis & Imutabel)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                    placeholder="Contoh: Ustadz Ahmad Fauzi"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Email Pengguna <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    required
                    placeholder="contoh@pesantren.sch.id"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Role Akun <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Ustadz">Ustadz / Tenaga Pengajar</option>
                    <option value="Santri">Santri (Siswa)</option>
                    <option value="Walisantri">Wali Santri (Orang Tua)</option>
                    
                    {/* Role Hierarchy: SuperAdmin only can grant SuperAdmin or Admin */}
                    {currentRole === 'SuperAdmin' ? (
                      <>
                        <option value="Admin">Admin Pesantren</option>
                        <option value="SuperAdmin">Super Admin (Akses Global Penuh)</option>
                      </>
                    ) : (
                      <>
                        <option value="Admin" disabled>Admin (Hanya SuperAdmin yang dapat mengangkat)</option>
                        <option value="SuperAdmin" disabled>Super Admin (Hanya SuperAdmin yang dapat mengangkat)</option>
                      </>
                    )}
                  </select>
                  {currentRole === 'Admin' && (
                    <p className="text-[10px] text-amber-500/90 mt-1">
                      Kebijakan Keamanan: Admin hanya berwenang membuat akun Staf/Ustadz, Santri, dan Wali Santri.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Username (Opsional)
                  </label>
                  <input
                    type="text"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="Auto dari email jika kosong"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Temporary Password Field */}
              <div className="p-3.5 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Kata Sandi Sementara (One-time Temporary Password, min 12 Karakter)</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] text-emerald-500 hover:text-emerald-400 font-semibold flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Buat Acak (16 Karakter)</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={createTempPassword}
                    onChange={(e) => setCreateTempPassword(e.target.value)}
                    required
                    minLength={12}
                    placeholder="Masukkan minimal 12 karakter..."
                    className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  🛡️ <strong>Prinsip Keamanan Zero-Knowledge:</strong> Kata sandi sementara hanya digunakan untuk aktivasi pertama kali. Pengguna akan diwajibkan mengubah kata sandi saat pertama kali login (<code>mustChangePassword=true</code>). Kata sandi tidak disimpan di Firestore, log, ataupun respon server.
                </p>
              </div>

              {/* Santri Linkage (if Walisantri or Santri) */}
              {(createRole === 'Walisantri' || createRole === 'Santri') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Nama Santri Terhubung
                    </label>
                    <input
                      type="text"
                      value={createLinkedName}
                      onChange={(e) => setCreateLinkedName(e.target.value)}
                      placeholder="Contoh: Muhammad Ali"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      NIS Santri Terhubung
                    </label>
                    <input
                      type="text"
                      value={createLinkedNis}
                      onChange={(e) => setCreateLinkedNis(e.target.value)}
                      placeholder="Contoh: 202607001"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Module Permissions Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Izin Akses Modul Sistem (Per-User Module Permissions)</span>
                  </label>
                  {createRole !== 'SuperAdmin' && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          ALL_MODULE_LIST.forEach((m) => {
                            all[m.id] = currentRole === 'SuperAdmin' ? true : !PLATFORM_ONLY_MODULES.includes(m.id);
                          });
                          setCreatePermissions(all);
                        }}
                        className="text-emerald-500 hover:underline"
                      >
                        Pilih Semua {currentRole === 'Admin' ? 'Modul Tenant' : ''}
                      </button>
                      <span className="text-slate-400">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          const perms: Record<string, boolean> = {};
                          ALL_MODULE_LIST.forEach((m) => {
                            perms[m.id] = isModuleAccessible(createRole, m.id, null);
                          });
                          setCreatePermissions(perms);
                        }}
                        className="text-slate-400 hover:text-slate-200 hover:underline"
                      >
                        Reset ke Default Role
                      </button>
                    </div>
                  )}
                </div>

                {createRole === 'SuperAdmin' ? (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-600 dark:text-purple-300">
                    SuperAdmin otomatis memiliki akses penuh tanpa pembatasan ke seluruh modul sistem.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 max-h-52 overflow-y-auto">
                    {ALL_MODULE_LIST.map((mod) => {
                      const isPlatformOnly = PLATFORM_ONLY_MODULES.includes(mod.id);
                      const isLockedForActor = isPlatformOnly && currentRole !== 'SuperAdmin';
                      const isChecked = isLockedForActor ? false : !!createPermissions[mod.id];

                      return (
                        <label
                          key={mod.id}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs border transition-colors ${
                            isLockedForActor
                              ? 'opacity-40 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5 cursor-not-allowed text-slate-400'
                              : isChecked
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-medium cursor-pointer'
                                : 'bg-white dark:bg-black/20 border-slate-200 dark:border-white/5 text-slate-500 hover:border-slate-300 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isLockedForActor}
                            checked={isChecked}
                            onChange={(e) => {
                              if (isLockedForActor) return;
                              setCreatePermissions({ ...createPermissions, [mod.id]: e.target.checked });
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                          />
                          <span className="truncate flex-1">{mod.name}</span>
                          {isPlatformOnly && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:text-purple-300 border border-purple-500/20 shrink-0 font-medium">
                              Platform
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  {isCreating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Membuat Akun...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Simpan & Buat Pengguna</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden my-8">
            <div className="p-6 bg-gradient-to-r from-emerald-950 to-slate-900 text-white flex items-center justify-between border-b border-emerald-800/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Edit Pengguna & Hak Akses Modul</h3>
                  <p className="text-xs text-slate-300">
                    {editingUser.name} ({editingUser.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {editError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Role Akun
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    disabled={editingUser.uid === currentActor?.uid}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    <option value="Ustadz">Ustadz / Tenaga Pengajar</option>
                    <option value="Santri">Santri (Siswa)</option>
                    <option value="Walisantri">Wali Santri (Orang Tua)</option>
                    {currentRole === 'SuperAdmin' ? (
                      <>
                        <option value="Admin">Admin Pesantren</option>
                        <option value="SuperAdmin">Super Admin (Akses Penuh)</option>
                      </>
                    ) : (
                      <>
                        <option value="Admin" disabled>Admin (Hanya SuperAdmin)</option>
                        <option value="SuperAdmin" disabled>Super Admin (Hanya SuperAdmin)</option>
                      </>
                    )}
                  </select>
                  {editingUser.uid === currentActor?.uid && (
                    <p className="text-[10px] text-amber-500 mt-1">Anda tidak dapat mengubah role akun Anda sendiri.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'disabled')}
                    disabled={editingUser.uid === currentActor?.uid}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    <option value="active">Aktif</option>
                    <option value="disabled">Dinonaktifkan</option>
                  </select>
                  {editingUser.uid === currentActor?.uid && (
                    <p className="text-[10px] text-amber-500 mt-1">Anda tidak dapat menonaktifkan akun Anda sendiri.</p>
                  )}
                </div>
              </div>

              {/* Module Permissions Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Hak Akses Modul Khusus Pengguna Ini</span>
                  </label>
                  {editRole !== 'SuperAdmin' && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          ALL_MODULE_LIST.forEach((m) => {
                            all[m.id] = currentRole === 'SuperAdmin' ? true : !PLATFORM_ONLY_MODULES.includes(m.id);
                          });
                          setEditPermissions(all);
                        }}
                        className="text-emerald-500 hover:underline"
                      >
                        Pilih Semua {currentRole === 'Admin' ? 'Modul Tenant' : ''}
                      </button>
                      <span className="text-slate-400">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          const perms: Record<string, boolean> = {};
                          ALL_MODULE_LIST.forEach((m) => {
                            perms[m.id] = isModuleAccessible(editRole, m.id, null);
                          });
                          setEditPermissions(perms);
                        }}
                        className="text-slate-400 hover:text-slate-200 hover:underline"
                      >
                        Reset ke Default Role
                      </button>
                    </div>
                  )}
                </div>

                {editRole === 'SuperAdmin' ? (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-600 dark:text-purple-300">
                    SuperAdmin memiliki hak akses penuh tanpa batasan. Hak akses modul SuperAdmin tidak dapat dikurangi.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 max-h-56 overflow-y-auto">
                    {ALL_MODULE_LIST.map((mod) => {
                      const isPlatformOnly = PLATFORM_ONLY_MODULES.includes(mod.id);
                      const isLockedForActor = isPlatformOnly && currentRole !== 'SuperAdmin';
                      const isChecked = isLockedForActor ? false : !!editPermissions[mod.id];

                      return (
                        <label
                          key={mod.id}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs border transition-colors ${
                            isLockedForActor
                              ? 'opacity-40 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5 cursor-not-allowed text-slate-400'
                              : isChecked
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-medium cursor-pointer'
                                : 'bg-white dark:bg-black/20 border-slate-200 dark:border-white/5 text-slate-500 hover:border-slate-300 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isLockedForActor}
                            checked={isChecked}
                            onChange={(e) => {
                              if (isLockedForActor) return;
                              setEditPermissions({ ...editPermissions, [mod.id]: e.target.checked });
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                          />
                          <span className="truncate flex-1">{mod.name}</span>
                          {isPlatformOnly && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:text-purple-300 border border-purple-500/20 shrink-0 font-medium">
                              Platform
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  {isUpdating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD LINK FEEDBACK MODAL */}
      {resetFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-500/30 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-emerald-950 to-slate-900 text-white flex items-center justify-between border-b border-emerald-800/30">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Tautan Reset Password</h3>
              </div>
              <button
                onClick={() => setResetFeedback(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {resetFeedback.message}
              </p>

              {resetFeedback.link && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Tautan Reset Langsung (Dapat disalin ke pengguna):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={resetFeedback.link}
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resetFeedback.link!);
                        alert('Tautan disalin ke papan klip!');
                      }}
                      className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      title="Salin Tautan"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setResetFeedback(null)}
                  className="w-full py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-800 dark:text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
