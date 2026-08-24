/**
 * Google Places search.
 *
 * Enabled only when VITE_GOOGLE_MAPS_API_KEY is set. Google has no key-less
 * mode, so without one the app keeps using the OpenStreetMap search rather than
 * losing the feature — see `searchRemote` / `searchNearby` in places.js.
 *
 * The SDK is fetched on the first search rather than at startup, so a page that
 * never searches never pays for the download.
 */

import { currentLang } from "./i18n.js";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

export const hasGoogleKey = () => Boolean(KEY);
/** The raw key, for `<APIProvider>` — the map surface needs it directly. */
export const googleMapsKey = () => KEY;

/** Set once the SDK has actually loaded, so callers can show attribution. */
let ready = false;
export const googleReady = () => ready;

let loader = null;

/**
 * Loads the Maps JS SDK once and caches the promise.
 *
 * Exported (not just used internally) because `GoogleTripMap` needs the same
 * loaded `google.maps` global to render the map itself — one script tag,
 * one key, shared between search and the map surface.
 */
export function loadGoogleMaps() {
  if (loader) return loader;
  if (!KEY) return Promise.reject(new Error("No Google Maps API key"));

  loader = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(KEY)}&v=weekly&libraries=places,marker&loading=async` +
      // Pins predictions AND resolved Place Details to the same language —
      // otherwise Google infers a language per call (often the OS locale,
      // not the app's), so a result picked in one script could resolve to a
      // different one. Google only reads this once per page load; it can't
      // be changed without reloading, same as the app's own lang toggle.
      `&language=${encodeURIComponent(currentLang())}`;
    script.onerror = () => reject(new Error("Google Maps SDK failed to load"));
    // The bootstrap defines importLibrary before the load event fires.
    script.onload = () =>
      window.google?.maps?.importLibrary
        ? resolve()
        : reject(new Error("Google Maps SDK loaded without importLibrary"));

    document.head.appendChild(script);
  }).catch((err) => {
    // Let a later attempt retry rather than caching the failure forever.
    loader = null;
    throw err;
  });

  return loader;
}

/**
 * Legacy `google.maps.places` classes, not the "Places API (New)" `Place`
 * class — this project's key has the classic Places API enabled, and unlike
 * that API's REST endpoints (blocked by CORS for browser callers), these JS
 * classes reach the same backend through a channel Google allows in-browser.
 */
let autocompleteService = null;
let placesService = null;
let sessionToken = null;

async function legacyServices() {
  await loadGoogleMaps();
  const { AutocompleteService, PlacesService, AutocompleteSessionToken } =
    await window.google.maps.importLibrary("places");
  ready = true;

  autocompleteService ??= new AutocompleteService();
  // PlacesService needs *a* map or node to attach to; it never renders into it.
  placesService ??= new PlacesService(document.createElement("div"));
  // One token per "typing session" batches predictions + the final Details
  // call into a single billing unit, same as Google's own Autocomplete widget.
  sessionToken ??= new AutocompleteSessionToken();

  return { autocompleteService, placesService };
}

/** Clears the session token once a place has been chosen, starting a fresh one. */
function resetSession() {
  sessionToken = null;
}

function statusOk(status) {
  const OK = window.google.maps.places.PlacesServiceStatus.OK;
  const ZERO = window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
  return status === OK || status === ZERO;
}

/**
 * Autocomplete predictions for a query — name + rough address only, no
 * coordinates yet. Call `resolveGooglePlace` once the caller picks one.
 */
export async function autocompleteGooglePlaces(
  query,
  { center, signal, limit = 8, radiusMeters = 35000, types } = {},
) {
  const { autocompleteService } = await legacyServices();

  const request = { input: query, sessionToken };
  if (types) request.types = types;
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    request.location = new window.google.maps.LatLng(center.lat, center.lng);
    request.radius = radiusMeters;
  }

  const predictions = await new Promise((resolve, reject) => {
    autocompleteService.getPlacePredictions(request, (rows, status) => {
      if (!statusOk(status)) {
        reject(new Error(`Autocomplete failed: ${status}`));
        return;
      }
      resolve(rows ?? []);
    });
  });

  if (signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  return predictions.slice(0, limit).map((p) => ({
    id: `g:${p.place_id}`,
    source: "google",
    placeId: p.place_id,
    name: p.structured_formatting?.main_text ?? p.description,
    address: p.structured_formatting?.secondary_text ?? "",
    // No lat/lng/contact info until resolved — the legacy API only returns
    // those from a separate, billed Place Details call.
    lat: 0,
    lng: 0,
  }));
}

/**
 * Full Place Details for a prediction's `placeId` — coordinates always,
 * phone/website/hours only when `details` is true (each field costs extra
 * under Google's pricing, so callers only ask where they're actually shown).
 */
export async function resolveGooglePlace(placeId, { details = false } = {}) {
  const { placesService } = await legacyServices();

  const fields = ["place_id", "name", "formatted_address", "geometry", "types"];
  if (details)
    fields.push("formatted_phone_number", "website", "opening_hours");

  const place = await new Promise((resolve, reject) => {
    placesService.getDetails(
      { placeId, fields, sessionToken },
      (row, status) => {
        if (!statusOk(status)) {
          reject(new Error(`Place details failed: ${status}`));
          return;
        }
        resolve(row);
      },
    );
  });

  // The session is spent once Details has been billed against it.
  resetSession();

  const address = place.formatted_address ?? "";
  return {
    id: `g:${place.place_id}`,
    source: "google",
    name: place.name ?? address.split(",")[0] ?? "",
    country: address.split(",").pop()?.trim() ?? "",
    address: address.split(",").slice(1, 3).join(", ").trim(),
    fullAddress: address,
    category: (place.types?.[0] ?? "").replace(/_/g, " "),
    lat: place.geometry?.location?.lat() ?? 0,
    lng: place.geometry?.location?.lng() ?? 0,
    phone: place.formatted_phone_number ?? "",
    website: place.website ?? "",
    openingHours: place.opening_hours?.weekday_text?.join("; ") ?? "",
  };
}

/**
 * Photo URLs for a place matching `query` — for trip/destination/attraction
 * imagery. One Text Search (biased to `center` when given, so a place resolves
 * near the trip rather than to somewhere of the same name elsewhere).
 *
 * A bare country/city often resolves to one administrative pin with a single,
 * unflattering photo — the source of the "weird picture". Callers instead ask
 * for the region's attractions, which returns many landmarks; we pool their
 * photos and rank wide, large images first (they read as scenery and crop
 * cleanly into a banner). Empty when nothing usable is found.
 */
export async function fetchPlacePhotos(
  query,
  { center, signal, limit = 10, maxWidth = 1200, radiusMeters = 50000 } = {},
) {
  const { placesService } = await legacyServices();

  const request = { query };
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    request.location = new window.google.maps.LatLng(center.lat, center.lng);
    request.radius = radiusMeters;
  }

  const rows = await new Promise((resolve, reject) => {
    placesService.textSearch(request, (results, status) => {
      if (!statusOk(status)) {
        reject(new Error(`Photo search failed: ${status}`));
        return;
      }
      resolve(results ?? []);
    });
  });

  if (signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  // Pool photos from the top results so there's a real choice to rank, not a
  // lone administrative pin's one photo.
  const pool = rows
    .filter((p) => p.photos?.length)
    .slice(0, 6)
    .flatMap((p) => p.photos);
  if (!pool.length) return [];

  // Landscape and large first: those are the flattering, banner-friendly shots.
  const ranked = pool.sort((a, b) => {
    const landscape = (p) => (Number(p.width) >= Number(p.height) ? 1 : 0);
    const byShape = landscape(b) - landscape(a);
    if (byShape) return byShape;
    return (Number(b.width) || 0) - (Number(a.width) || 0);
  });

  return ranked.slice(0, limit).map((ph) => ph.getUrl({ maxWidth }));
}

/** The query that yields attractive, on-topic imagery for a place — its
 *  landmarks rather than a lone administrative pin. Shared so the auto-pick
 *  and the header's "Sync photo" stay in step. */
export const attractionsQuery = (place) => `tourist attractions in ${place}`;

/**
 * Text search — for category browsing, where results need coordinates up
 * front rather than a pick-then-resolve flow. Same legacy Places API; phone/
 * website/hours still require a per-result Details call, so those are left
 * blank here and filled in by `resolveGooglePlace` if the result is chosen.
 */
export async function searchGooglePlaces(
  query,
  { center, signal, limit = 8, radiusMeters = 35000 } = {},
) {
  const { placesService } = await legacyServices();

  const request = { query };
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    request.location = new window.google.maps.LatLng(center.lat, center.lng);
    request.radius = radiusMeters;
  }

  const rows = await new Promise((resolve, reject) => {
    placesService.textSearch(request, (results, status) => {
      if (!statusOk(status)) {
        reject(new Error(`Text search failed: ${status}`));
        return;
      }
      resolve(results ?? []);
    });
  });

  if (signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  return rows.slice(0, limit).map((place) => {
    const address = place.formatted_address ?? "";
    return {
      id: `g:${place.place_id}`,
      source: "google",
      placeId: place.place_id,
      name: place.name ?? address.split(",")[0] ?? "",
      country: address.split(",").pop()?.trim() ?? "",
      address: address.split(",").slice(1, 3).join(", ").trim(),
      fullAddress: address,
      category: (place.types?.[0] ?? "").replace(/_/g, " "),
      lat: place.geometry?.location?.lat() ?? 0,
      lng: place.geometry?.location?.lng() ?? 0,
      phone: "",
      website: "",
      openingHours: "",
    };
  });
}
