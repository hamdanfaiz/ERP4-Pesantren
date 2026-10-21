import { createClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as {
  env?: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string };
}).env || {};

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function supabaseClientConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}
