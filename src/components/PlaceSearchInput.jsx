import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, MapPin } from 'lucide-react'
import { searchNearby } from '../lib/places.js'
import { hasGoogleKey, searchGooglePlaces } from '../lib/googlePlaces.js'

/**
 * A text field that doubles as a place lookup.
 *
 * Typing is always allowed — a station nobody has mapped is still a valid name
 * to write down — but picking a suggestion additionally attaches coordinates,
 * which is what lets the map route through it.
 */
export default function PlaceSearchInput({
  value,
  onChange,
  center,
  placeholder,
  label,
  className = '',
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef(null)
  const dirtyRef = useRef(false)

  // Follow the stored value unless the user is mid-edit.
  useEffect(() => {
    if (!dirtyRef.current) setQuery(value?.name ?? '')
  }, [value?.name])

  useEffect(() => {
    const q = query.trim()
    if (!dirtyRef.current || q.length < 2) {
      setResults([])
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const rows = hasGoogleKey()
          ? await searchGooglePlaces(q, {
              center,
              signal: controller.signal,
              limit: 6,
            }).catch(() => searchNearby(q, center, controller.signal, 6))
          : await searchNearby(q, center, controller.signal, 6)
        setResults(rows)
        setHighlight(0)
        setOpen(true)
      } catch (err) {
        if (err.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, center])

  useEffect(() => {
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [])

  function choose(place) {
    dirtyRef.current = false
    setQuery(place.name)
    setResults([])
    setOpen(false)
    onChange({ name: place.name, lat: place.lat, lng: place.lng })
  }

  /** Free text keeps the name but drops any stale coordinates. */
  function commitTyped() {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    const name = query.trim()
    if (name === (value?.name ?? '')) return
    onChange({ name, lat: 0, lng: 0 })
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') commitTyped()
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

  const located = Boolean(value?.lat || value?.lng)

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            dirtyRef.current = true
            setQuery(e.target.value)
          }}
          onBlur={commitTyped}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={open && results.length > 0}
          className="field !py-1 !pe-6 !text-xs"
        />
        <span className="pointer-events-none absolute inset-y-0 end-1.5 grid place-items-center">
          {loading ? (
            <Loader2 size={12} className="animate-spin text-subtle" />
          ) : (
            // A tick, not a pin: the station is a recognised place, but it
            // does not appear on the map or affect the route line.
            located && <Check size={12} className="text-accent" />
          )}
        </span>
      </div>

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg shadow-brand-950/20"
        >
          {results.map((place, i) => (
            <li key={place.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                // mousedown fires before the input's blur, which would
                // otherwise commit the typed text and close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(place)
                }}
                className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-start text-xs transition ${
                  i === highlight ? 'bg-accent-soft' : 'hover:bg-raised'
                }`}
              >
                <MapPin size={12} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">
                    {place.name}
                  </span>
                  {place.address && (
                    <span className="block truncate text-[10px] text-muted">
                      {place.address}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
