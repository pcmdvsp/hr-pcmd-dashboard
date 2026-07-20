import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key)
// Keep the browser session after refreshes and browser restarts. The session is
// removed only when the user explicitly chooses Sign out (or Supabase revokes it).
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pcmd-working-status-auth',
  },
}) : null
