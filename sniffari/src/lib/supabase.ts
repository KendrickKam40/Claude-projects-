// Creates the Supabase client only when the project is configured, so the app runs fully without it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// The Vercel Supabase integration (prefix "VITE_") sets these; newer projects may only have a publishable key.
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
