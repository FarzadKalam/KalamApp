import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Variables');
}

const globalStore = globalThis as typeof globalThis & {
  __kalam_supabase_client__?: ReturnType<typeof createClient>;
  __kalam_supabase_signup_client__?: ReturnType<typeof createClient>;
};

if (!globalStore.__kalam_supabase_client__) {
  globalStore.__kalam_supabase_client__ = createClient(supabaseUrl, supabaseAnonKey);
}

if (!globalStore.__kalam_supabase_signup_client__) {
  globalStore.__kalam_supabase_signup_client__ = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'sb-signup-auth-token',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = globalStore.__kalam_supabase_client__;
export const supabaseSignUpClient = globalStore.__kalam_supabase_signup_client__;

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__kalamSupabase = supabase;
}
