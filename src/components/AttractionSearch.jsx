import { useEffect, useRef, useState } from 'react'
import { Clock, Globe, Loader2, MapPin, Phone, Search, Store, X } from 'lucide-react'
import { searchNearby } from '../lib/places.js'
import { BIZ_CATEGORIES, searchBusinesses } from '../lib/bizdata.js'
import { hasGoogleKey, searchGooglePlaces } from '../lib/googlePlaces.js'
import { useI18n } from '../lib/i18n.js'

/**
 * Two search sources behind one box.
 *
 * Typing runs a free-text place lookup (Nominatim) — the only way to find
 * something by name. The category chips run BizData, which can only answer
 * "every museum in this city" but returns phone, website and opening hours
 * with each result.
 *
 * BizData is slow the first time a city/category pair is asked for, so it never
 * blocks: its results append when they arrive.
 */
export default function AttractionSearch({ center, onSelect }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null)

  const [placeHits, setPlaceHits] = useState([])
  const [bizHits, setBizHits] = useState([])
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [loadingBiz, setLoadingBiz] = useState(false)
  const [bizError, setBizError] = useState(false)

  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef(null)

  /* --- free text → Nominatim -------------------------------------------- */
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setPlaceHits([])
      setLoadingPlaces(false)
      return undefined
    }

    const controller = new AbortController()
    setLoadingPlaces(true)

    // Nominatim asks for at most one request a second; debounce and abort.
    const timer = setTimeout(async () => {
      try {
        const rows = hasGoogleKey()
          ? await searchGooglePlaces(q, {
              center,
              signal: controller.signal,
              details: true,
            }).catch(() =>
              searchNearby(q, center, controller.signal).then((r) =>
                r.map((x) => ({ ...x, source: 'osm' })),
              ),
            )
          : (await searchNearby(q, center, controller.signal)).map((r) => ({
              ...r,
              source: 'osm',
            }))
        setPlaceHits(rows)
        setOpen(true)
      } catch (err) {
        if (err.name !== 'AbortError') setPlaceHits([])
      } finally {
        setLoadingPlaces(false)
      }
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, center])

  /* --- category chip → BizData ------------------------------------------ */
  useEffect(() => {
    if (!category || !center?.name) {
      setBizHits([])
      setLoadingBiz(false)
      return undefined
    }

    const controller = new AbortController()
    setLoadingBiz(true)
    setBizError(false)
    setOpen(true)

    // Google's own category text search replaces BizData when a key is
    // present — same "every museum in this city" job, no separate free API.
    const run = hasGoogleKey()
      ? searchGooglePlaces(category, {
          center,
          signal: controller.signal,
          details: true,
          limit: 12,
        }).catch(() =>
          searchBusinesses(center.name, category, {
            signal: controller.signal,
          }),
        )
      : searchBusinesses(center.name, category, {
          signal: controller.signal,
        })

    run
      .then((rows) => setBizHits(rows))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setBizHits([])
          setBizError(true)
        }
      })
      .finally(() => setLoadingBiz(false))

    return () => controller.abort()
    // `center` is intentionally excluded — a new object with the same name
    // shouldn't re-trigger the search, only actually switching destination should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, center?.name])

  useEffect(() => {
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [])

  // Free-text matches first: they answer a specific question, the category
  // list is a browse.
  const results = [...placeHits, ...bizHits]
  const loading = loadingPlaces || loadingBiz

  useEffect(() => setHighlight(0), [query, category])

  function choose(place) {
    onSelect({
      name: place.name,
      address: place.address ?? '',
      lat: place.lat,
      lng: place.lng,
      phone: place.phone ?? '',
      website: place.website ?? '',
      openingHours: place.openingHours ?? '',
    })
    setQuery('')
    setPlaceHits([])
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        // No match picked — add it by name so the plan isn't blocked.
        choose({ name: query.trim(), address: '', lat: 0, lng: 0 })
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <Search size={15} className="shrink-0 text-subtle" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('attractions.searchPlaceholder')}
          aria-label={t('attractions.searchLabel')}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="attraction-results"
          className="w-full bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
        />
        {loading && (
          <Loader2 size={14} className="shrink-0 animate-spin text-subtle" />
        )}
      </div>

      {/* Category chips browse BizData for this destination. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {BIZ_CATEGORIES.map((c) => {
          const on = category === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(on ? null : c.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                on
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong text-muted hover:border-accent hover:text-fg'
              }`}
            >
              {t(c.key)}
              {on && <X size={11} />}
            </button>
          )
        })}
      </div>

      {loadingBiz && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 size={11} className="animate-spin" />
          {t('biz.loading')}
        </p>
      )}
      {bizError && (
        <p className="mt-1.5 text-[11px] text-muted">{t('biz.error')}</p>
      )}

      {open && results.length > 0 && (
        <ul
          id="attraction-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg shadow-brand-950/20"
        >
          {results.map((place, i) => {
            const isBiz = place.source === 'bizdata'
            const hasContactInfo = place.openingHours || place.phone
            return (
              <li key={place.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(place)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-start text-sm transition ${
                    i === highlight ? 'bg-accent-soft' : 'hover:bg-raised'
                  }`}
                >
                  {isBiz ? (
                    <Store size={15} className="mt-0.5 shrink-0 text-accent" />
                  ) : (
                    <MapPin size={15} className="mt-0.5 shrink-0 text-accent" />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-fg">
                        {place.name}
                      </span>
                      {isBiz && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                          {t('biz.badge')}
                        </span>
                      )}
                    </span>

                    {(place.address || place.category) && (
                      <span className="block truncate text-[11px] text-muted">
                        {[place.category, place.address]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}

                    {/* Contact details from BizData, or from Google when the
                        category search asked for them. */}
                    {hasContactInfo && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-subtle">
                        {place.openingHours && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={10} /> {place.openingHours}
                          </span>
                        )}
                        {place.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={10} /> {place.phone}
                          </span>
                        )}
                        {place.website && <Globe size={10} />}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
