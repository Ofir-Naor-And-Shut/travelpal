import { useSyncExternalStore } from "react";
import { hasSupabase, supabase } from "./supabase.js";

/**
 * Auth state, layered so the rest of the app can stay oblivious to Supabase.
 *
 * Two independent pieces of state:
 *  - the Supabase `session` (null until signed in), and whether we've finished
 *    the initial check (`ready`) so the UI doesn't flash the sign-in screen
 *    before a persisted session has had a chance to load;
 *  - a `localOnly` flag — the user's explicit choice to use the app without an
 *    account. Persisted, so the choice survives a reload rather than re-gating
 *    them every visit. Signing in supersedes it.
 *
 * With no Supabase configured at all, there's simply no session and `ready` is
 * true from the start — the app runs local-only, the graceful-degradation path.
 */

const LOCAL_ONLY_KEY = "project-travel:local-only";

/* --- Supabase session ------------------------------------------------------ */

let session = null;
let ready = !hasSupabase;
let sessionSnapshot = { session, ready };
const sessionListeners = new Set();

function emitSession() {
  sessionSnapshot = { session, ready };
  sessionListeners.forEach((l) => l());
}

if (hasSupabase) {
  // Prime from any persisted session, then track every later change.
  supabase.auth.getSession().then(({ data }) => {
    session = data.session ?? null;
    ready = true;
    emitSession();
  });

  supabase.auth.onAuthStateChange((_event, next) => {
    session = next ?? null;
    ready = true;
    // A real sign-in overrides an earlier "use without an account" choice.
    if (session) setLocalOnly(false);
    emitSession();
  });
}

function subscribeSession(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** `{ session, ready }`. `ready` gates the initial splash. */
export function useSession() {
  return useSyncExternalStore(
    subscribeSession,
    () => sessionSnapshot,
    () => sessionSnapshot,
  );
}

/** The current Supabase session outside React (store.js's cloud sync). */
export function getSession() {
  return session;
}

/** Subscribe to session changes outside React. Returns an unsubscribe fn. */
export { subscribeSession };

/** The signed-in user's email, or null. */
export const sessionEmail = (s) => s?.user?.email ?? null;

/* --- magic-link actions ---------------------------------------------------- */

/**
 * Send a passwordless sign-in link. First time for an email, this also creates
 * the account — so it's both "sign up" and "log in". Resolves once the mail is
 * on its way; the session itself only arrives when the link is opened.
 */
export async function sendMagicLink(email) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  // VITE_SITE_URL pins the redirect target explicitly (needed for deployed
  // environments — see .env.local); falls back to wherever the page is
  // actually running, which is what local dev needs.
  const siteUrl = import.meta.env.VITE_SITE_URL?.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // The link returns to the app; supabase.js has detectSessionInUrl on to
    // pick the session out of the URL hash when it lands.
    options: { emailRedirectTo: siteUrl || window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  if (hasSupabase) await supabase.auth.signOut();
}

/**
 * Password sign-in — no email round trip, used only by accounts that have a
 * password set (in practice, the one admin account; see supabase/schema.sql
 * phase 4). Regular accounts are magic-link-only and never get a password,
 * so this simply fails for them rather than needing its own gating.
 */
export async function signInWithPassword(email, password) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** True when the session carries the `admin` app_metadata claim — settable
 *  only by a service-role request, never by the user themselves, so this is
 *  trustworthy to branch UI on. */
export const isAdmin = (s) => s?.user?.app_metadata?.role === "admin";

/* --- local-only preference ------------------------------------------------- */

function readLocalOnly() {
  try {
    return localStorage.getItem(LOCAL_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

let localOnly = readLocalOnly();
const localOnlyListeners = new Set();

export function setLocalOnly(value) {
  if (localOnly === value) return;
  localOnly = value;
  try {
    if (value) localStorage.setItem(LOCAL_ONLY_KEY, "1");
    else localStorage.removeItem(LOCAL_ONLY_KEY);
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
  localOnlyListeners.forEach((l) => l());
}

function subscribeLocalOnly(listener) {
  localOnlyListeners.add(listener);
  return () => localOnlyListeners.delete(listener);
}

export function useLocalOnly() {
  return useSyncExternalStore(
    subscribeLocalOnly,
    () => localOnly,
    () => localOnly,
  );
}

/** The current local-only choice outside React (store.js's mode switch). */
export function getLocalOnly() {
  return localOnly;
}

/** Subscribe to local-only changes outside React. Returns an unsubscribe fn. */
export { subscribeLocalOnly };
