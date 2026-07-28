import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { Layers } from 'lucide-react'
import { TransportIcon } from './TransportLeg.jsx'
import { arcPoints, splitArc } from '../lib/arc.js'
import {
  TRANSPORT_MODES,
  formatDay,
  isPlaced,
  legOf,
  modeColor,
} from '../lib/store.js'
import { useI18n } from '../lib/i18n.js'
import { useTheme } from '../lib/theme.js'

/**
 * Basemaps. Voyager leads because it keeps street names, parks and water
 * legible at every zoom without the clutter of raw OSM tiles.
 *
 * `darkUrl` swaps in a natively dark tileset where one exists, which reads far
 * better than dimming a light one with a CSS filter.
 */
const BASEMAPS = [
  {
    id: 'voyager',
    key: 'map.streets',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '© OpenStreetMap · © CARTO',
  },
  {
    id: 'positron',
    key: 'map.minimal',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    darkUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '© OpenStreetMap · © CARTO',
  },
  {
    id: 'terrain',
    key: 'map.terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 17,
    attribution: '© OpenTopoMap · © OpenStreetMap',
  },
  {
    id: 'satellite',
    key: 'map.satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '© Esri · Maxar · Earthstar Geographics',
  },
]

const STYLE_KEY = 'project-travel:basemap'

const SPRITE_ID = (mode) => `mode-icon-${mode}`

/**
 * Off-screen copies of the mode icons that the Leaflet badges point at.
 *
 * Leaflet icons are HTML strings, not React nodes. Rendering lucide components
 * to markup would mean pulling `react-dom/server` into the browser bundle —
 * ~58 kB gzipped for six glyphs. Referencing one hidden copy per mode with
 * `<use>` costs nothing extra and keeps the map badges and the itinerary pills
 * drawing from the same icon set.
 */
function ModeIconSprite() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      {TRANSPORT_MODES.map((m) => (
        <TransportIcon
          key={m.id}
          id={SPRITE_ID(m.id)}
          mode={m.id}
          size={24}
          strokeWidth={2.4}
        />
      ))}
    </svg>
  )
}

function modeBadgeIcon(mode, color, small) {
  const box = small ? 22 : 26
  const glyph = small ? 12 : 14

  return L.divIcon({
    className: '',
    // `currentColor` inside the referenced icon resolves against this element.
    html:
      `<div class="leg-badge" style="color:${color};width:${box}px;height:${box}px">` +
      `<svg viewBox="0 0 24 24" width="${glyph}" height="${glyph}">` +
      `<use href="#${SPRITE_ID(mode)}"/></svg></div>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -box / 2],
  })
}

/**
 * Popup body for a link. The headline is the two destinations, because that is
 * what the line actually connects; stations sit underneath as detail.
 */
function LegSummary({ leg, t }) {
  const origin = leg.station?.origin
  const destination = leg.station?.destination

  return (
    <>
      <p className="text-sm font-semibold">
        {leg.from.name} → {leg.to.name}
      </p>
      <p className="text-xs" style={{ color: leg.color }}>
        {t(`mode.${leg.mode}`)}
      </p>
      {(origin || destination) && (
        <p className="mt-0.5 text-xs text-muted">
          {origin || '—'} → {destination || '—'}
        </p>
      )}
    </>
  )
}

function numberedIcon(index, active, dark, small = false, clickable = false) {
  const classes = [
    'pin',
    small && 'pin-sm',
    active && 'pin-active',
    dark && 'pin-on-dark',
    clickable && 'pin-clickable',
  ]
    .filter(Boolean)
    .join(' ')

  return L.divIcon({
    className: '',
    html: `<div class="${classes}">${index + 1}</div>`,
    iconSize: small ? [26, 26] : [32, 32],
    iconAnchor: small ? [13, 13] : [16, 16],
    popupAnchor: [0, small ? -14 : -18],
  })
}

/**
 * Leaflet caches its container size, so a panel resize leaves the map showing
 * stale tiles and mis-placed pins until it's told to re-measure.
 */
function AutoResize() {
  const map = useMap()

  useEffect(() => {
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ animate: false }),
    )
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])

  return null
}

/**
 * Keeps the viewport framed around the route, arcs included.
 *
 * `fitKey` is a primitive summary of the geometry: the effect must re-run when
 * the route actually changes, but not on every unrelated render, and the array
 * of points is a fresh reference each time.
 */
function FitBounds({ points, fallback, soloZoom, maxZoom, fitKey }) {
  const map = useMap()

  useEffect(() => {
    // No geometry yet — frame the city so the search has somewhere to land.
    if (points.length === 0) {
      if (fallback) {
        map.setView([fallback.lat, fallback.lng], fallback.zoom, {
          animate: true,
        })
      }
      return
    }

    if (points.length === 1) {
      map.setView(points[0], soloZoom, { animate: true })
      return
    }

    map.fitBounds(L.latLngBounds(points), {
      padding: [60, 60],
      maxZoom,
      animate: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])

  return null
}

export default function TripMap({
  destinations,
  activeId,
  onHover,
  dayRoute,
  onOpenDetails,
}) {
  const { t } = useI18n()
  const { theme } = useTheme()
  const [styleId, setStyleId] = useState(
    () => localStorage.getItem(STYLE_KEY) ?? 'voyager',
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  const basemap = BASEMAPS.find((b) => b.id === styleId) ?? BASEMAPS[0]
  const isDark = theme === 'dark'
  const tileUrl = (isDark && basemap.darkUrl) || basemap.url
  // True when the tiles themselves are dark, so pins and casings need to flip.
  const onDark = basemap.id === 'satellite' || (isDark && Boolean(basemap.darkUrl))

  function chooseStyle(id) {
    setStyleId(id)
    setPickerOpen(false)
    try {
      localStorage.setItem(STYLE_KEY, id)
    } catch {
      // Non-fatal: the choice just won't survive a reload.
    }
  }

  // In Day by day the map narrows to one day's attraction route; elsewhere it
  // shows the whole trip. Both are just "an ordered list of placed points with
  // a mode on each hop", so the rendering below is shared.
  const inDayMode = Boolean(dayRoute)

  const stops = useMemo(
    () => (inDayMode ? dayRoute.stops : destinations.filter(isPlaced)),
    [inDayMode, dayRoute, destinations],
  )

  // A stable primitive key stops the arcs and fitBounds from being rebuilt on
  // every unrelated render (renaming a stop, editing a cost, …). The centre is
  // part of it so moving between two still-empty days still re-frames the map.
  const routeKey = [
    inDayMode ? 'day' : 'trip',
    inDayMode && dayRoute.center
      ? `@${dayRoute.center.lat},${dayRoute.center.lng}`
      : '',
    ...stops.map((s) => {
      // Station names ride along so their popups refresh, but they carry no
      // coordinates here — the geometry depends only on the destinations.
      const hops = inDayMode
        ? [s.legOut?.mode ?? '-']
        : legOf(s).map(
            (seg) =>
              `${seg.mode}:${seg.origin.name}>${seg.destination.name}`,
          )
      return `${s.id}:${s.lat},${s.lng}:${hops.join('+') || '-'}`
    }),
  ].join('|')

  const legs = useMemo(() => {
    const out = []

    for (let i = 0; i < stops.length - 1; i += 1) {
      const from = stops[i]
      const to = stops[i + 1]
      const a = [from.lat, from.lng]
      const b = [to.lat, to.lng]
      // City hops are short, so a gentler bow reads better than the sweeping
      // arc used between cities.
      const curvature = inDayMode ? 0.08 : 0.18

      // A day route still has exactly one mode per hop.
      const segments = inDayMode
        ? [{ id: 'day', mode: from.legOut?.mode ?? 'walk' }]
        : legOf(from)

      if (segments.length === 0) {
        // No transport chosen yet — still show the connection, neutrally.
        const points = arcPoints(a, b, { curvature })
        out.push({
          id: `${from.id}->${to.id}`,
          from,
          to,
          mode: 'train',
          color: modeColor('train'),
          points,
          midpoint: points[Math.floor(points.length / 2)],
          badge: null,
        })
        continue
      }

      /**
       * Links run destination to destination. Stations are informative only —
       * they never move the line, because a station's coordinates say nothing
       * about the shape of the journey between two cities.
       *
       * One curve is drawn for the whole leg and then cut into a piece per hop,
       * so every mode gets its own colour while the leg stays a single smooth
       * sweep. Resolution is a multiple of the hop count so the cuts land on
       * exact boundaries.
       */
      const wholeArc = arcPoints(a, b, {
        curvature,
        segments: Math.max(96, segments.length * 48),
      })
      const pieces = splitArc(wholeArc, segments.length)

      segments.forEach((segment, s) => {
        const color = modeColor(segment.mode)
        const points = pieces[s]

        out.push({
          id: `${from.id}->${to.id}#${segment.id}`,
          from,
          to,
          mode: segment.mode,
          color,
          points,
          // Sits on the arc itself rather than the straight midpoint, so the
          // badge never floats off the line it belongs to.
          midpoint: points[Math.floor(points.length / 2)],
          badge: modeBadgeIcon(segment.mode, color, inDayMode),
          station: !inDayMode
            ? {
                origin: segment.origin?.name || null,
                destination: segment.destination?.name || null,
              }
            : null,
        })
      })
    }

    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Bounds follow the drawn geometry so a bowed leg never gets cropped.
  const boundsPoints = useMemo(() => {
    const pts = stops.map((s) => [s.lat, s.lng])
    legs.forEach((leg) => pts.push(...leg.points))
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  const usedModes = useMemo(
    () => [...new Set(legs.map((l) => l.mode))],
    [legs],
  )

  return (
    <div className="relative h-full w-full">
      <ModeIconSprite />

      <MapContainer
        center={[45.4642, 9.19]}
        zoom={5}
        scrollWheelZoom
        className="h-full w-full"
        attributionControl={false}
      >
        <TileLayer
          key={`${basemap.id}:${isDark}`}
          url={tileUrl}
          subdomains={basemap.subdomains}
          maxZoom={basemap.maxZoom}
          detectRetina
          // A natively dark tileset shouldn't also get the CSS dimming filter.
          className={basemap.darkUrl ? 'tile-no-dim' : undefined}
        />

        {/* Casing under every leg keeps thin colour readable on any basemap;
            it flips to a dark halo where the tiles themselves are dark. */}
        {legs.map((leg) => (
          <Polyline
            key={`casing-${leg.id}`}
            positions={leg.points}
            pathOptions={{
              color: onDark ? '#0d0c1a' : '#ffffff',
              weight: 8,
              opacity: onDark ? 0.5 : 0.85,
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false,
              // Leaflet's default simplification would straighten the arc.
              smoothFactor: 0,
            }}
          />
        ))}

        {legs.map((leg) => (
          <Polyline
            key={leg.id}
            positions={leg.points}
            pathOptions={{
              color: leg.color,
              weight: 4,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
              smoothFactor: 0,
            }}
          >
            <Popup>
              <LegSummary leg={leg} t={t} />
            </Popup>
          </Polyline>
        ))}

        {/* Mode badge sitting on each link, so the chosen transport is legible
            without cross-referencing the colour legend. */}
        {legs
          .filter((leg) => leg.badge)
          .map((leg) => (
            <Marker
              key={`badge-${leg.id}`}
              position={leg.midpoint}
              icon={leg.badge}
              // Keep pins above badges where they overlap.
              zIndexOffset={-200}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <span className="text-xs font-semibold">
                  {t(`mode.${leg.mode}`)}
                </span>
              </Tooltip>
              <Popup>
                <LegSummary leg={leg} t={t} />
              </Popup>
            </Marker>
          ))}

        {stops.map((stop, i) => {
          // Trip pins number by position in the full itinerary, not in the
          // filtered list, so an unplaced stop doesn't shift the numbering.
          const index = inDayMode
            ? i
            : destinations.findIndex((d) => d.id === stop.id)
          return (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={numberedIcon(
                index,
                activeId === stop.id,
                onDark,
                inDayMode,
                !inDayMode,
              )}
              eventHandlers={{
                mouseover: () => onHover?.(stop.id),
                mouseout: () => onHover?.(null),
                // A destination pin is a shortcut into its Details tab. Day
                // pins are attractions, which have no details of their own.
                click: () => {
                  if (!inDayMode) onOpenDetails?.(stop.id)
                },
              }}
            >
              {inDayMode ? (
                <Popup>
                  <p className="text-sm font-semibold">
                    {stop.name || t('attractions.fallback')}
                  </p>
                  {stop.time && (
                    <p className="tabular text-xs text-muted">{stop.time}</p>
                  )}
                  {stop.address && (
                    <p className="text-xs text-muted">{stop.address}</p>
                  )}
                </Popup>
              ) : (
                /* Hover rather than a popup, so the click stays free to
                   navigate while the same information is still reachable. */
                <Tooltip direction="top" offset={[0, -18]}>
                  <span className="text-sm font-semibold">{stop.name}</span>
                  <span className="block text-xs text-muted">
                    {formatDay(stop.startDate)} – {formatDay(stop.endDate)}
                  </span>
                  <span className="block text-xs text-muted">
                    {stop.nights}{' '}
                    {stop.nights === 1
                      ? t('plan.night')
                      : t('plan.nightsPlural')}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-accent">
                    {t('map.openDetails')}
                  </span>
                </Tooltip>
              )}
            </Marker>
          )
        })}

        <AutoResize />
        <FitBounds
          points={boundsPoints}
          fitKey={routeKey}
          // City work needs a much closer view than hopping between countries.
          soloZoom={inDayMode ? 15 : 9}
          maxZoom={inDayMode ? 16 : 11}
          fallback={
            inDayMode && dayRoute.center
              ? { ...dayRoute.center, zoom: 13 }
              : null
          }
        />
      </MapContainer>

      {/* --- Basemap picker ------------------------------------------------ */}
      <div className="absolute end-3 top-3 z-[600] flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-2 rounded-full bg-surface/95 px-3 py-2 text-xs font-semibold text-fg shadow-md backdrop-blur transition hover:bg-surface"
        >
          <Layers size={15} />
          {t(basemap.key)}
        </button>

        {pickerOpen && (
          <div
            role="radiogroup"
            aria-label={t('map.style')}
            className="overflow-hidden rounded-xl bg-surface/95 shadow-lg backdrop-blur"
          >
            {BASEMAPS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={b.id === basemap.id}
                onClick={() => chooseStyle(b.id)}
                className={`block w-full px-4 py-2 text-start text-xs font-medium transition ${
                  b.id === basemap.id
                    ? 'bg-accent text-on-accent'
                    : 'text-fg hover:bg-raised'
                }`}
              >
                {t(b.key)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Legend, only for modes actually on the route ------------------- */}
      {usedModes.length > 0 && (
        <ul className="absolute bottom-20 start-3 z-[600] flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-surface/90 px-3 py-2 shadow-md backdrop-blur">
          {usedModes.map((mode) => (
            <li
              key={mode}
              className="flex items-center gap-1.5 text-[11px] font-medium text-fg"
            >
              <span
                aria-hidden
                className="h-1 w-4 rounded-full"
                style={{ background: modeColor(mode) }}
              />
              {t(`mode.${mode}`)}
            </li>
          ))}
        </ul>
      )}

      <p
        dir="ltr"
        className="pointer-events-none absolute bottom-20 end-1 z-[600] rounded bg-surface/80 px-1.5 py-0.5 text-[10px] text-muted"
      >
        {basemap.attribution}
      </p>

      {/* Badge naming the day being shown, so the narrowed view is obvious. */}
      {inDayMode && (
        <p className="absolute start-3 top-3 z-[600] rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent shadow-md">
          {t('map.dayRoute', { name: dayRoute.label })}
        </p>
      )}

      {stops.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          <p className="rounded-full bg-surface/90 px-4 py-2 text-xs font-medium text-muted">
            {inDayMode ? t('map.dayEmpty') : t('map.empty')}
          </p>
        </div>
      )}
    </div>
  )
}
