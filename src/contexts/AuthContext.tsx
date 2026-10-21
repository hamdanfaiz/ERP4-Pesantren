import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { setAuthSession } from '../authSession';
import { supabase, supabaseClientConfigured } from '../utils/supabase';
import { UserRole } from '../rbac';

export interface AuthUser {
  uid: string;
  name: string;
  email?: string;
  username?: string;
  role: UserRole;
  tenantId: string;
  tenantName: string;
  tenantType?: 'Pesantren' | 'Sekolah' | 'Tahfidz Center';
  unitId?: string;
  status: string;
  mustChangePassword?: boolean;
  modulePermissions?: Record<string, boolean>;
  linkedSantriId?: string;
  linkedSantriName?: string;
  linkedSantriNis?: string;
  linkedSantriClass?: string;
  linkedSantriRoom?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearMustChangePassword: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: 'Public',
  isAuthenticated: false,
  isLoading: true,
  login: async () => { throw new Error('Layanan autentikasi belum siap.'); },
  logout: async () => {},
  refreshProfile: async () => {},
  clearMustChangePassword: async () => {},
});

const ALLOWED_ROLES: UserRole[] = ['SuperAdmin', 'Admin', 'Ustadz', 'Santri', 'Walisantri'];

function profileToAuthUser(uid: string, email: string | null, profile: Record<string, any>): AuthUser {
  const role = profile.role as UserRole;
  const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId.trim() : '';
  const status = typeof profile.status === 'string' ? profile.status.toLowerCase() : '';

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error('Role akun tidak valid. Hubungi administrator pesantren.');
  }
  if (!tenantId) {
    throw new Error('Akun belum terhubung ke tenant pesantren. Hubungi administrator.');
  }
  if (status !== 'active') {
    throw new Error('Akun belum aktif. Hubungi administrator pesantren.');
  }

  const modulePermissions = typeof profile.modulePermissions === 'object' && profile.modulePermissions !== null
    ? (profile.modulePermissions as Record<string, boolean>)
    : undefined;

  return {
    uid,
    name: String(profile.name || profile.displayName || email || 'Pengguna'),
    email: email || (typeof profile.email === 'string' ? profile.email : undefined),
    username: typeof profile.username === 'string' ? profile.username : undefined,
    role,
    tenantId,
    tenantName: typeof profile.tenantName === 'string' && profile.tenantName.trim()
      ? profile.tenantName.trim()
      : tenantId,
    tenantType: profile.tenantType === 'Sekolah' || profile.tenantType === 'Tahfidz Center'
      ? profile.tenantType
      : 'Pesantren',
    unitId: typeof profile.unitId === 'string' ? profile.unitId : undefined,
    status: status || 'active',
    mustChangePassword: Boolean(profile.mustChangePassword),
    modulePermissions,
    linkedSantriId: typeof profile.linkedSantriId === 'string' ? profile.linkedSantriId : undefined,
    linkedSantriName: typeof profile.linkedSantriName === 'string' ? profile.linkedSantriName : undefined,
    linkedSantriNis: typeof profile.linkedSantriNis === 'string' ? profile.linkedSantriNis : undefined,
    linkedSantriClass: typeof profile.linkedSantriClass === 'string' ? profile.linkedSantriClass : undefined,
    linkedSantriRoom: typeof profile.linkedSantriRoom === 'string' ? profile.linkedSantriRoom : undefined,
  };
}

async function loadUserProfile(authUser: SupabaseAuthUser): Promise<{ user: AuthUser; role: UserRole }> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) throw new Error('Profil akun tidak dapat dibaca. Silakan coba kembali.');
  if (!data) throw new Error('Profil akun belum diprovisikan. Hubungi administrator pesantren.');
  const profile = {
    role: data.role,
    tenantId: data.tenant_id,
    tenantName: data.tenant_name,
    tenantType: data.tenant_type,
    unitId: data.unit_id,
    status: data.status,
    name: data.name,
    email: data.email,
    username: data.username,
    mustChangePassword: data.must_change_password,
    modulePermissions: data.module_permissions,
    linkedSantriId: data.linked_santri_id,
    linkedSantriName: data.linked_santri_name,
    linkedSantriNis: data.linked_santri_nis,
    linkedSantriClass: data.linked_santri_class,
    linkedSantriRoom: data.linked_santri_room,
  };
  const role = profile.role as UserRole;
  const user = profileToAuthUser(authUser.id, authUser.email ?? null, profile);
  return { user, role };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<UserRole>('Public');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    let unsubscribe: (() => void) | undefined;

    const initializeAuth = async () => {
      try {
        if (!supabaseClientConfigured()) throw new Error('Konfigurasi Supabase belum lengkap.');
        if (!mounted) return;

        const { data } = supabase.auth.onAuthStateChange((_event, authSession) => {
          const currentRevision = ++revision;
          const authUser = authSession?.user ?? null;
          if (!authUser || !authSession) {
            setAuthSession(null);
            setUser(null);
            setRole('Public');
            setIsLoading(false);
            return;
          }

          setAuthSession({
            uid: authUser.id,
            email: authUser.email ?? null,
            accessToken: authSession.access_token,
          });
          setIsLoading(true);
          window.setTimeout(async () => {
            try {
              const session = await loadUserProfile(authUser);
              if (!mounted || currentRevision !== revision) return;
              setUser(session.user);
              setRole(session.role);
            } catch {
              if (!mounted || currentRevision !== revision) return;
              setAuthSession(null);
              setUser(null);
              setRole('Public');
              try { await supabase.auth.signOut(); } catch { /* Keep the session fail-closed. */ }
            } finally {
              if (mounted && currentRevision === revision) setIsLoading(false);
            }
          }, 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch {
        if (mounted) {
          setAuthSession(null);
          setUser(null);
          setRole('Public');
          setIsLoading(false);
        }
      }
    };

    void initializeAuth();
    return () => {
      mounted = false;
      revision += 1;
      unsubscribe?.();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) throw new Error('Email dan kata sandi wajib diisi.');

    let authenticatedUser: SupabaseAuthUser | null = null;
    setIsLoading(true);
    try {
      if (!supabaseClientConfigured()) throw new Error('Konfigurasi Supabase belum lengkap.');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error || !data.user || !data.session) {
        const invalid = !error || /invalid login credentials|invalid email or password|email not confirmed/i.test(error.message || '');
        throw new Error(invalid ? 'Email atau kata sandi tidak cocok.' : error.message);
      }
      authenticatedUser = data.user;
      setAuthSession({
        uid: data.user.id,
        email: data.user.email ?? null,
        accessToken: data.session.access_token,
      });
      const session = await loadUserProfile(data.user);
      setUser(session.user);
      setRole(session.role);
    } catch (error: any) {
      if (authenticatedUser) {
        try { await supabase.auth.signOut(); } catch { /* Reject the session if profile validation fails. */ }
      }
      setAuthSession(null);
      setUser(null);
      setRole('Public');
      const message = error instanceof Error ? error.message : 'Login gagal. Silakan coba kembali.';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setAuthSession(null);
    setUser(null);
    setRole('Public');
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const session = await loadUserProfile(data.session.user);
    setUser(session.user);
    setRole(session.role);
  };

  const clearMustChangePassword = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Pengguna belum terautentikasi.');
    const token = data.session.access_token;
    const res = await fetch('/api/users/clear-must-change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal menghapus status kewajiban ganti password.');
    }
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : null));
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAuthenticated: user !== null && role !== 'Public',
      isLoading,
      login,
      logout,
      refreshProfile,
      clearMustChangePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
