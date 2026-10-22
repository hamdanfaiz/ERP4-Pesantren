import { createClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as {
  env?: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string };
}).env || {};

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
const unavailableSupabaseUrl = 'http://127.0.0.1:54321';
const rejectUnconfiguredRequest: typeof fetch = async () => {
  throw new Error('Konfigurasi Supabase belum lengkap. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY saat build.');
};

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : unavailableSupabaseUrl,
  isSupabaseConfigured ? supabaseKey : 'missing-supabase-publishable-key',
  {
    global: {
      fetch: isSupabaseConfigured ? fetch : rejectUnconfiguredRequest,
    },
    auth: {
      persistSession: isSupabaseConfigured,
      storage: isSupabaseConfigured && typeof window !== 'undefined' ? window.sessionStorage : undefined,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: false,
    },
  },
);

export function supabaseClientConfigured(): boolean {
  return isSupabaseConfigured;
}
