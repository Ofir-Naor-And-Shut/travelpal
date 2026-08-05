import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client.
 *
 * Enabled only when the env vars are present. Without them the app keeps
 * working entirely local-first (localStorage + IndexedDB) — the same
 * graceful-degradation pattern used for the optional search providers. That
 * also means a fork of this repo with no `.env.local` still runs.
 *
 * The anon key is a public client credential: it ships in the browser and is
 * protected by Row-Level Security, not by being secret.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const hasSupabase = Boolean(url && anonKey)

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      auth: {
        // Magic-link sign-in: persist the session and refresh it silently.
        persistSession: true,
        autoRefreshToken: true,
        // The session arrives in the URL hash after clicking the email link.
        detectSessionInUrl: true,
      },
    })
  : null
