import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function hasBrowserSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export const supabase = hasBrowserSupabaseConfig()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
