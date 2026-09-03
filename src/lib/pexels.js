/**
 * Pexels photo search — decorative imagery for trip covers and destination
 * cards.
 *
 * Enabled only when VITE_PEXELS_API_KEY is set; without it the app simply
 * shows the emoji fallback, exactly like the Google search key. Pexels'
 * CDN URLs are stable and cacheable, so — unlike Google's Places photo links
 * — they don't lapse, and no self-heal/refetch machinery is needed.
 *
 * The key is a public client credential (Vite's VITE_ prefix bundles it into
 * the browser); Pexels has no separate server-only secret. CORS is open, so
 * the search is called straight from the browser with the key in the
 * Authorization header. Free tier: 200 requests/hour, 20k/month.
 *
 * Pexels' API guidelines require a visible credit wherever their photos are
 * shown — surfaced as a "Photos from Pexels" line (see i18n `photo.pexels`).
 */

const KEY = import.meta.env?.VITE_PEXELS_API_KEY?.trim();

export const hasPexelsKey = () => Boolean(KEY);

/** Public Pexels home, for the attribution link. */
export const PEXELS_URL = "https://www.pexels.com";

const BASE = "https://api.pexels.com/v1/search";

/** Give up rather than leave a spinner running forever on a slow lookup. */
const TIMEOUT_MS = 12000;

// Results are cached per query so repeated cover/destination lookups within a
// session don't re-spend the rate limit on an identical search.
const cache = new Map();

/**
 * Landscape photo URLs for a free-text `query` (a place name), best first.
 * Returns an empty array with no key, no query, or nothing found — callers
 * treat that as "keep the emoji". `perPage` caps how many candidates come
 * back (the header shuffle wants a handful; auto-pick wants just one).
 */
export async function fetchPexelsPhotos(query, { perPage = 10, signal } = {}) {
  const q = query?.trim();
  if (!KEY || !q) return [];

  const cacheKey = `${q}::${perPage}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort);
  }
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url =
      `${BASE}?query=${encodeURIComponent(q)}` +
      `&per_page=${perPage}&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: KEY },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Pexels search failed: ${res.status}`);

    const data = await res.json();
    // Prefer the pre-cropped landscape rendition (reads cleanly as a banner);
    // fall back to a large or original if a photo lacks it.
    const urls = (data.photos ?? [])
      .map((p) => p.src?.landscape || p.src?.large || p.src?.original || "")
      .filter(Boolean);

    cache.set(cacheKey, urls);
    return urls;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
