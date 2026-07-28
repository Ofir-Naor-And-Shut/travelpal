/**
 * BizData — free business search over OpenStreetMap data.
 *
 * No API key, no billing, and CORS is open, so it can be called straight from
 * the browser. It complements Nominatim rather than replacing it:
 *
 *   Nominatim  free text  →  "Doi Suthep", "Wat Phra Singh", any named place
 *   BizData    category   →  every museum / hotel / restaurant in a city,
 *                            with phone, website and opening hours
 *
 * Two constraints shape how it is used here, both confirmed against the live
 * API rather than assumed:
 *
 *  1. `location` must be a place *name*. Passing lat/lon returns
 *     400 "Missing required parameter: location".
 *  2. `category` must be one of a fixed list — it is a category browser, not a
 *     free-text search.
 *
 * Responses are slow the first time a location/category pair is requested
 * (6-12s observed) and fast afterwards (~77ms), so callers must treat it as a
 * background source that fills in late, never as a blocking one.
 */

const BASE = 'https://bizdata-web.vercel.app/api'

/** Give up rather than leave a spinner running forever on a cold lookup. */
const TIMEOUT_MS = 15000

/**
 * The travel-relevant slice of BizData's 37 categories, grouped for the UI.
 * `key` is an i18n key; `id` is the API's category value.
 */
export const BIZ_CATEGORIES = [
  { id: 'museum', key: 'biz.museum', group: 'culture' },
  { id: 'gallery', key: 'biz.gallery', group: 'culture' },
  { id: 'theatre', key: 'biz.theatre', group: 'culture' },
  { id: 'restaurant', key: 'biz.restaurant', group: 'food' },
  { id: 'cafe', key: 'biz.cafe', group: 'food' },
  { id: 'bar', key: 'biz.bar', group: 'food' },
  { id: 'hotel', key: 'biz.hotel', group: 'stay' },
  { id: 'hostel', key: 'biz.hostel', group: 'stay' },
  { id: 'supermarket', key: 'biz.supermarket', group: 'practical' },
  { id: 'pharmacy', key: 'biz.pharmacy', group: 'practical' },
]

export const isBizCategory = (id) => BIZ_CATEGORIES.some((c) => c.id === id)

/**
 * Cache keyed by location+category+radius. The API is already cached server
 * side, but this also spares the round trip when a chip is toggled repeatedly.
 */
const cache = new Map()

function toResult(row) {
  return {
    id: `biz:${row.osm_id}`,
    source: 'bizdata',
    name: row.name ?? '',
    // Trim the country/postcode tail; the leading part is the useful hint.
    // Parts are re-joined from trimmed pieces because the API's own spacing is
    // inconsistent ("Piazza Compasso d'Oro,  1").
    address: (row.address ?? '')
      .split(',')
      .slice(0, 2)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', '),
    fullAddress: row.address ?? '',
    category: (row.category ?? '').replace(/_/g, ' '),
    lat: Number(row.lat),
    lng: Number(row.lon),
    phone: row.phone || '',
    website: row.website || '',
    openingHours: row.opening_hours || '',
  }
}

/**
 * Businesses of one category in one place.
 *
 * @param {string} location  Place name — a city, not coordinates.
 * @param {string} category  One of BIZ_CATEGORIES.
 */
export async function searchBusinesses(
  location,
  category,
  { signal, limit = 12, radiusKm = 8 } = {},
) {
  const place = (location ?? '').trim()
  if (!place || !isBizCategory(category)) return []

  const key = `${place.toLowerCase()}|${category}|${radiusKm}|${limit}`
  if (cache.has(key)) return cache.get(key)

  const url = new URL(`${BASE}/businesses`)
  url.searchParams.set('location', place)
  url.searchParams.set('category', category)
  url.searchParams.set('radius_km', String(radiusKm))
  url.searchParams.set('limit', String(limit))

  // Compose the caller's signal with our own timeout so either can cancel.
  const timer = new AbortController()
  const onAbort = () => timer.abort()
  signal?.addEventListener('abort', onAbort)
  const timeout = setTimeout(() => timer.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: timer.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`BizData returned ${res.status}`)

    const json = await res.json()
    const results = (json.businesses ?? [])
      .filter((row) => row.name && Number.isFinite(Number(row.lat)))
      .map(toResult)

    cache.set(key, results)
    return results
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}
