import { del, get, keys, set } from "idb-keyval";

/**
 * An explicit, on-demand offline copy of a cloud trip — separate from the
 * per-device localStorage store, which cloud-mode trips no longer use at all.
 * Kept in IndexedDB alongside document blobs (docs.js) for the same reason:
 * it's a client-side cache, not the source of truth.
 *
 * Only written when the user taps "download"; never refreshed automatically,
 * so it's an explicit snapshot rather than a silent background mirror.
 */

const PREFIX = "offline-trip:";
const key = (tripId) => `${PREFIX}${tripId}`;

export async function saveTripOffline(trip) {
  await set(key(trip.id), trip);
}

export async function loadOfflineTrip(tripId) {
  return get(key(tripId));
}

export async function isTripDownloaded(tripId) {
  return Boolean(await get(key(tripId)));
}

export async function removeOfflineTrip(tripId) {
  await del(key(tripId));
}

/** Every downloaded trip — the last resort when a cloud fetch fails outright. */
export async function loadAllOfflineTrips() {
  const allKeys = await keys();
  const tripKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(PREFIX),
  );
  const trips = await Promise.all(tripKeys.map((k) => get(k)));
  return trips.filter(Boolean);
}
