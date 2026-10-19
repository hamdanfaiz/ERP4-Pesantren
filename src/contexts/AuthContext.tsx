import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
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

async function loadUserProfile(firebaseUser: FirebaseUser): Promise<{ user: AuthUser; role: UserRole }> {
  const profileSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!profileSnapshot.exists()) {
    throw new Error('Profil akun belum diprovisikan. Hubungi administrator pesantren.');
  }
  const profile = profileSnapshot.data();
  const role = profile.role as UserRole;
  const user = profileToAuthUser(firebaseUser.uid, firebaseUser.email, profile);
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
        await setPersistence(auth, browserSessionPersistence);
        if (!mounted) return;

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          const currentRevision = ++revision;
          if (!firebaseUser) {
            setUser(null);
            setRole('Public');
            setIsLoading(false);
            return;
          }

          setIsLoading(true);
          try {
            const session = await loadUserProfile(firebaseUser);
            if (!mounted || currentRevision !== revision) return;
            setUser(session.user);
            setRole(session.role);
          } catch (error) {
            if (!mounted || currentRevision !== revision) return;
            setUser(null);
            setRole('Public');
            try { await signOut(auth); } catch { /* Keep the session fail-closed. */ }
          } finally {
            if (mounted && currentRevision === revision) setIsLoading(false);
          }
        });
      } catch {
        if (mounted) {
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

    let authenticatedUser: FirebaseUser | null = null;
    setIsLoading(true);
    try {
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      authenticatedUser = credential.user;
      const session = await loadUserProfile(credential.user);
      setUser(session.user);
      setRole(session.role);
    } catch (error: any) {
      if (authenticatedUser) {
        try { await signOut(auth); } catch { /* Reject the session if profile validation fails. */ }
      }
      setUser(null);
      setRole('Public');
      const code = error?.code;
      const message = code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
        ? 'Email atau kata sandi tidak cocok.'
        : error instanceof Error
          ? error.message
          : 'Login gagal. Silakan coba kembali.';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setRole('Public');
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    const session = await loadUserProfile(auth.currentUser);
    setUser(session.user);
    setRole(session.role);
  };

  const clearMustChangePassword = async () => {
    if (!auth.currentUser) throw new Error('Pengguna belum terautentikasi.');
    const token = await auth.currentUser.getIdToken();
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
