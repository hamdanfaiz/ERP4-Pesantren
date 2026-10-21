import { useEffect, useState } from 'react';
import { supabase } from './utils/supabase';

export type AuthSessionIdentity = {
  uid: string;
  email: string | null;
  accessToken: string;
};

let currentSession: AuthSessionIdentity | null = null;
const listeners = new Set<() => void>();

export function setAuthSession(next: AuthSessionIdentity | null) {
  currentSession = next;
  listeners.forEach((listener) => listener());
}

export function getAuthSession(): AuthSessionIdentity | null {
  return currentSession;
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthSessionUid(): string | null {
  const [uid, setUid] = useState<string | null>(() => currentSession?.uid ?? null);
  useEffect(() => subscribeAuthSession(() => setUid(currentSession?.uid ?? null)), []);
  return uid;
}

export async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token || !session.user) {
    throw new Error('Pengguna belum terautentikasi.');
  }
  setAuthSession({
    uid: session.user.id,
    email: session.user.email ?? null,
    accessToken: session.access_token,
  });
  return session.access_token;
}
