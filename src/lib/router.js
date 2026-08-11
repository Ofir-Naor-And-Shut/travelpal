import { useSyncExternalStore } from "react";

/**
 * Minimal hash-based routing for the one navigation the app has: picker vs. a
 * specific trip's editor (`#/trip/<id>`). Keeping the open trip in the URL
 * means a refresh (or a bookmarked/shared link) reopens the same trip instead
 * of always dropping back to the picker — and the browser's back/forward
 * buttons move between the two screens for free.
 */

const TRIP_HASH_RE = /^#\/trip\/(.+)$/;

function parseTripId(hash) {
  const match = TRIP_HASH_RE.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function getSnapshot() {
  return parseTripId(window.location.hash);
}

function subscribe(listener) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** The trip id encoded in the URL, or null when on the picker route. */
export function useRouteTripId() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Point the URL at a trip's editor. A no-op if it's already there. */
export function setRouteTrip(id) {
  const next = `#/trip/${encodeURIComponent(id)}`;
  if (window.location.hash !== next) window.location.hash = next;
}

/** Drop the URL back to the picker route without pushing a new history entry. */
export function clearRouteTrip() {
  if (window.location.hash) {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}
