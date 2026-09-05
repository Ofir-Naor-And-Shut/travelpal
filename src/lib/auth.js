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

// True from the moment a password-recovery link is opened until a new
// password is actually set — the recovery link does create a real session,
// but App.jsx must show the "set your password" screen instead of treating
// that as a normal sign-in.
let recoveryMode = false;
const recoveryListeners = new Set();

function emitRecoveryMode() {
  recoveryListeners.forEach((l) => l());
}

if (hasSupabase) {
  // Prime from any persisted session, then track every later change.
  supabase.auth.getSession().then(({ data }) => {
    session = data.session ?? null;
    ready = true;
    emitSession();
  });

  supabase.auth.onAuthStateChange((event, next) => {
    session = next ?? null;
    ready = true;
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      emitRecoveryMode();
    } else if (event === "SIGNED_OUT") {
      recoveryMode = false;
      emitRecoveryMode();
    }
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

/** True while a password-recovery link is open but no new password has been
 *  set yet — App.jsx uses this to show the "set your password" screen ahead
 *  of the normal signed-in/signed-out gate. */
export function usePasswordRecovery() {
  return useSyncExternalStore(
    (listener) => {
      recoveryListeners.add(listener);
      return () => recoveryListeners.delete(listener);
    },
    () => recoveryMode,
    () => recoveryMode,
  );
}

function siteUrl() {
  // VITE_SITE_URL pins the redirect target explicitly (needed for deployed
  // environments — see .env.local); falls back to wherever the page is
  // actually running, which is what local dev needs.
  return import.meta.env.VITE_SITE_URL?.trim() || window.location.origin;
}

export async function signOut() {
  if (hasSupabase) await supabase.auth.signOut();
}

/** Email + password sign-in — the primary login path. */
export async function signInWithPassword(email, password) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Create an account with a password. If the email is already registered —
 * including an old magic-link-only account that has never had a password —
 * Supabase reports that by returning an empty `identities` array rather than
 * an error (the standard non-enumerating signal), so no error is ever thrown
 * for "already registered". Instead this transparently sends the same
 * password-set/reset link used for that case, and the caller shows one
 * neutral "check your inbox" message regardless of which branch ran — the UI
 * must never reveal whether the account already existed.
 */
export async function signUpWithPassword(email, password) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: siteUrl() },
  });
  if (error) throw error;
  if (data.user && data.user.identities?.length === 0) {
    await sendPasswordResetLink(email);
  }
}

/**
 * Emails a password-recovery link. Doubles as both "forgot password" and the
 * backward-compat "set a password" step for an old magic-link account — the
 * two cases look identical from here (and to the UI), which is what keeps
 * this from leaking account existence.
 */
export async function sendPasswordResetLink(email) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl(),
  });
  if (error) throw error;
}

/** Sets the password for the session opened by a recovery link. */
export async function updateUserPassword(password) {
  if (!hasSupabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  recoveryMode = false;
  emitRecoveryMode();
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
