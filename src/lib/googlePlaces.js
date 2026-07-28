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

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()

export const hasGoogleKey = () => Boolean(KEY)

/** Set once the SDK has actually loaded, so callers can show attribution. */
let ready = false
export const googleReady = () => ready

let loader = null

function loadSdk() {
  if (loader) return loader
  if (!KEY) return Promise.reject(new Error('No Google Maps API key'))

  loader = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(KEY)}&v=weekly&libraries=places&loading=async`
    script.onerror = () =>
      reject(new Error('Google Maps SDK failed to load'))
    // The bootstrap defines importLibrary before the load event fires.
    script.onload = () =>
      window.google?.maps?.importLibrary
        ? resolve()
        : reject(new Error('Google Maps SDK loaded without importLibrary'))

    document.head.appendChild(script)
  }).catch((err) => {
    // Let a later attempt retry rather than caching the failure forever.
    loader = null
    throw err
  })

  return loader
}

/** Normalise a Place into the same shape the OSM search returns. */
function toResult(place) {
  const address = place.formattedAddress ?? ''
  return {
    id: `g:${place.id}`,
    name: place.displayName ?? address.split(',')[0] ?? '',
    // Callers use `country` (destinations) or `address` (stations, attractions);
    // the last address part is the country in Google's formatting.
    country: address.split(',').pop()?.trim() ?? '',
    address: address.split(',').slice(1, 3).join(', ').trim(),
    category: (place.types?.[0] ?? '').replace(/_/g, ' '),
    lat: place.location?.lat() ?? 0,
    lng: place.location?.lng() ?? 0,
  }
}

/**
 * Text search, optionally biased towards a centre.
 *
 * `signal` mirrors the fetch-based path: the SDK has no abort support, so a
 * cancelled search is discarded on return instead.
 */
export async function searchGooglePlaces(
  query,
  { center, signal, limit = 8, radiusMeters = 35000 } = {},
) {
  await loadSdk()
  const { Place } = await window.google.maps.importLibrary('places')
  ready = true

  const request = {
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
    maxResultCount: Math.min(limit, 20),
  }

  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    request.locationBias = {
      center: { lat: center.lat, lng: center.lng },
      radius: radiusMeters,
    }
  }

  const { places } = await Place.searchByText(request)

  if (signal?.aborted) {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    throw error
  }

  return (places ?? []).map(toResult)
}
