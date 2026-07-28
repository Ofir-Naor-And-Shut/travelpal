import { useSyncExternalStore } from 'react'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { currentDateLocale } from './i18n.js'

const STORAGE_KEY = 'project-travel:trip:v2'
const LEGACY_KEY = 'project-travel:trip:v1'

const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * Each mode carries its own colour so a leg reads the same way in the list, on
 * the map and in the legend. Train keeps the brand teal; the rest fan out into
 * hues that stay legible on top of a colourful basemap.
 */
export const TRANSPORT_MODES = [
  { id: 'plane', label: 'Flight', color: '#E4572E' },
  { id: 'train', label: 'Train', color: '#17858F' },
  { id: 'bus', label: 'Bus', color: '#E8A33D' },
  { id: 'car', label: 'Car', color: '#6A4C93' },
  { id: 'ferry', label: 'Ferry', color: '#2E86C1' },
  { id: 'walk', label: 'Walk', color: '#57A773' },
]

export function modeColor(mode) {
  return TRANSPORT_MODES.find((m) => m.id === mode)?.color ?? '#17858F'
}

export function modeLabel(mode) {
  return TRANSPORT_MODES.find((m) => m.id === mode)?.label ?? 'Travel'
}

export const CURRENCIES = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'ILS', symbol: '₪' },
  { code: 'THB', symbol: '฿' },
  { code: 'JPY', symbol: '¥' },
]

/** Document slots that hang off a destination. */
export const DOC_SLOTS = ['travelDocs', 'sleepingDocs']

/** An empty station: a name the user typed, optionally geocoded. */
const emptyStation = () => ({ name: '', lat: 0, lng: 0 })

/**
 * One hop of a journey between two destinations. A leg is an array of these,
 * so "bus to the airport, flight, train into town" is three segments rather
 * than one lossy "plane".
 */
export function makeSegment(partial = {}) {
  const { origin, destination, ...rest } = partial
  return {
    id: uid(),
    mode: 'train',
    durationMin: 0,
    distanceKm: 0,
    cost: 0,
    ...rest,
    origin: { ...emptyStation(), ...origin },
    destination: { ...emptyStation(), ...destination },
  }
}

/** Segments leaving a destination; always an array, empty for the last stop. */
export const legOf = (dest) =>
  Array.isArray(dest?.transportOut) ? dest.transportOut : []

export function legTotals(dest) {
  return legOf(dest).reduce(
    (acc, s) => ({
      durationMin: acc.durationMin + num(s.durationMin),
      distanceKm: acc.distanceKm + num(s.distanceKm),
      cost: acc.cost + num(s.cost),
    }),
    { durationMin: 0, distanceKm: 0, cost: 0 },
  )
}

function makeDestination(partial = {}) {
  return {
    id: uid(),
    name: 'New destination',
    country: '',
    lat: 0,
    lng: 0,
    nights: 2,
    sleeping: { name: '', cost: 0 },
    notes: '',
    travelDocs: [],
    sleepingDocs: [],
    // Segments leaving THIS destination for the next one. Empty on the last.
    transportOut: [],
    ...partial,
  }
}

/**
 * Days are addressed by the stop they belong to plus how many nights in, so
 * entries stay attached to their place in the itinerary when the trip start
 * date moves. Trimming nights leaves an entry orphaned but intact — add the
 * night back and it returns.
 */
export const dayKey = (destId, nightIndex) => `${destId}:${nightIndex}`

const EMPTY_DAY = { attractions: [], reservations: [], accommodation: null }

/**
 * A night's own accommodation.
 *
 * `null` means the day inherits whatever the destination has, which is the
 * common case. Adding one overrides just that night — for a mid-stay hotel
 * change — and carries its own documents.
 */
export function makeDayAccommodation(partial = {}) {
  return {
    name: '',
    cost: 0,
    address: '',
    notes: '',
    documents: [],
    ...partial,
  }
}

export function makeAttraction(partial = {}) {
  return {
    id: uid(),
    name: '',
    time: '',
    cost: 0,
    done: false,
    lat: 0,
    lng: 0,
    address: '',
    // Carried over when the attraction came from a business listing.
    phone: '',
    website: '',
    openingHours: '',
    // How you travel from THIS attraction to the next one that day.
    legOut: null,
    ...partial,
  }
}

export function makeReservation(partial = {}) {
  return {
    id: uid(),
    name: '',
    time: '',
    cost: 0,
    done: false,
    documents: [],
    ...partial,
  }
}

export function getDay(trip, key) {
  const day = trip.days?.[key]
  if (!day) return EMPTY_DAY
  return {
    attractions: day.attractions ?? [],
    reservations: day.reservations ?? [],
    accommodation: day.accommodation ?? null,
  }
}

/** A stop is only routable once it has real coordinates. */
export const isPlaced = (p) =>
  Number.isFinite(p?.lat) &&
  Number.isFinite(p?.lng) &&
  !(p.lat === 0 && p.lng === 0)

function seedTrip() {
  const dest = (name, country, lat, lng, nights, transportOut) =>
    makeDestination({ name, country, lat, lng, nights, transportOut })

  return {
    title: 'An Italian Adventure',
    emoji: '🌍',
    startDate: '2026-06-09',
    endDate: '2026-06-25',
    currency: 'EUR',
    days: {},
    destinations: [
      dest('Milano', 'Italy', 45.4642, 9.19, 2, [
        makeSegment({
          mode: 'train',
          durationMin: 147,
          distanceKm: 280,
          cost: 42,
        }),
      ]),
      dest('Venice', 'Italy', 45.4408, 12.3155, 3, [
        makeSegment({
          mode: 'train',
          durationMin: 133,
          distanceKm: 258,
          cost: 38,
        }),
      ]),
      dest('Florence', 'Italy', 43.7696, 11.2558, 3, [
        makeSegment({
          mode: 'car',
          durationMin: 180,
          distanceKm: 231,
          cost: 60,
        }),
      ]),
      dest('Rome', 'Italy', 41.9028, 12.4964, 4, []),
    ],
  }
}

/* -------------------------------------------------------------------------- */
/*  Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** Fill in anything a stored payload predates or is missing. */
function normalize(trip) {
  const days = Object.fromEntries(
    Object.entries(trip.days ?? {}).map(([key, day]) => [
      key,
      {
        // Older saves had no time, coordinates or route legs on attractions.
        attractions: (day?.attractions ?? []).map((a) => makeAttraction(a)),
        reservations: (day?.reservations ?? []).map((r) => makeReservation(r)),
        accommodation: day?.accommodation
          ? makeDayAccommodation(day.accommodation)
          : null,
      },
    ]),
  )

  return {
    ...seedTrip(),
    ...trip,
    days,
    destinations: (trip.destinations ?? []).map((d) => ({
      ...makeDestination(),
      ...d,
      sleeping: { name: '', cost: 0, ...d.sleeping },
      travelDocs: d.travelDocs ?? [],
      sleepingDocs: d.sleepingDocs ?? [],
      transportOut: normalizeLeg(d.transportOut),
    })),
  }
}

/**
 * Legs used to be a single `{ mode, durationMin, distanceKm, cost }` object.
 * They are now an ordered list of segments; an old leg becomes a one-segment
 * journey so nothing is lost.
 */
function normalizeLeg(leg) {
  if (Array.isArray(leg)) return leg.map((s) => makeSegment(s))
  if (leg && typeof leg === 'object') return [makeSegment(leg)]
  return []
}

/**
 * v1 kept a single `documents` list per stop and `activities` on the stop
 * rather than on a day. Travel paperwork is the better default for existing
 * uploads, and activities land on the first night of their stop.
 */
function migrateV1(old) {
  if (!old || !Array.isArray(old.destinations)) return seedTrip()

  const days = {}
  const destinations = old.destinations.map((dest) => {
    const { activities, documents, ...rest } = dest

    if (Array.isArray(activities) && activities.length > 0) {
      days[dayKey(dest.id, 0)] = {
        attractions: activities.map((a) =>
          makeAttraction({ id: a.id, name: a.name ?? '', cost: num(a.cost) }),
        ),
        reservations: [],
      }
    }

    return {
      ...makeDestination(),
      ...rest,
      travelDocs: documents ?? [],
      sleepingDocs: [],
    }
  })

  return normalize({ ...old, destinations, days })
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.destinations)) return normalize(parsed)
      return seedTrip()
    }

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const migrated = migrateV1(JSON.parse(legacy))
      // Write straight away so the migration is durable even if the user only
      // reads the trip. The v1 payload is left untouched as a fallback.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      } catch {
        // Non-fatal — the in-memory trip is still correct.
      }
      return migrated
    }

    return seedTrip()
  } catch {
    return seedTrip()
  }
}

let state = load()
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota or private-mode failure — keep the in-memory state usable.
  }
  listeners.forEach((l) => l())
}

export function useTrip() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

/* -------------------------------------------------------------------------- */
/*  Trip + destination mutations                                               */
/* -------------------------------------------------------------------------- */

export function updateTrip(patch) {
  commit({ ...state, ...patch })
}

function mapDestinations(fn) {
  commit({ ...state, destinations: fn(state.destinations) })
}

export function addDestination(partial) {
  mapDestinations((list) => {
    const next = [...list]
    // The stop that used to be last now needs a leg out to the newcomer.
    if (next.length > 0) {
      const prev = next[next.length - 1]
      next[next.length - 1] = {
        ...prev,
        transportOut: legOf(prev).length ? prev.transportOut : [makeSegment()],
      }
    }
    next.push(makeDestination({ ...partial, transportOut: [] }))
    return next
  })
}

export function updateDestination(id, patch) {
  mapDestinations((list) =>
    list.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  )
}

export function removeDestination(id) {
  const next = state.destinations.filter((d) => d.id !== id)
  // Whatever ends up last must not keep a dangling leg.
  if (next.length > 0) {
    next[next.length - 1] = { ...next[next.length - 1], transportOut: [] }
  }

  // Drop the removed stop's days too, or they linger forever.
  const days = Object.fromEntries(
    Object.entries(state.days).filter(([key]) => !key.startsWith(`${id}:`)),
  )

  commit({ ...state, destinations: next, days })
}

/**
 * Move a destination to an arbitrary index — used by both the chevron buttons
 * and drag-and-drop.
 *
 * Legs describe "how you leave this stop", so they belong to the position in
 * the itinerary rather than to the destination being moved. Detach them,
 * reorder, then re-attach by index.
 */
export function reorderDestinations(from, to) {
  mapDestinations((list) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
      return list
    }

    const legs = list.map((d) => legOf(d))
    const next = list.map((d) => ({ ...d, transportOut: [] }))
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    return next.map((d, i) => ({
      ...d,
      transportOut: i === next.length - 1 ? [] : (legs[i] ?? []),
    }))
  })
}

export function moveDestination(id, direction) {
  const from = state.destinations.findIndex((d) => d.id === id)
  if (from < 0) return
  reorderDestinations(from, from + direction)
}

export function setNights(id, nights) {
  updateDestination(id, { nights: Math.max(0, Math.min(365, nights)) })
}

/* --- transport segments ---------------------------------------------------- */

function mapLeg(destId, fn) {
  mapDestinations((list) =>
    list.map((d) => (d.id === destId ? { ...d, transportOut: fn(legOf(d)) } : d)),
  )
}

export function addSegment(destId, partial = {}) {
  mapLeg(destId, (segments) => [...segments, makeSegment(partial)])
}

export function updateSegment(destId, segmentId, patch) {
  mapLeg(destId, (segments) =>
    segments.map((s) => (s.id === segmentId ? { ...s, ...patch } : s)),
  )
}

/** Patch one end of a segment; `end` is 'origin' or 'destination'. */
export function setSegmentStation(destId, segmentId, end, station) {
  mapLeg(destId, (segments) =>
    segments.map((s) =>
      s.id === segmentId
        ? { ...s, [end]: { ...emptyStation(), ...station } }
        : s,
    ),
  )
}

export function removeSegment(destId, segmentId) {
  mapLeg(destId, (segments) => segments.filter((s) => s.id !== segmentId))
}

export function reorderSegments(destId, from, to) {
  mapLeg(destId, (segments) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= segments.length ||
      to >= segments.length
    ) {
      return segments
    }
    const next = [...segments]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  })
}

/* -------------------------------------------------------------------------- */
/*  Destination documents (metadata only — bytes live in IndexedDB)            */
/* -------------------------------------------------------------------------- */

export function addDestDoc(destId, slot, meta) {
  mapDestinations((list) =>
    list.map((d) => (d.id === destId ? { ...d, [slot]: [...d[slot], meta] } : d)),
  )
}

export function removeDestDoc(destId, slot, docId) {
  mapDestinations((list) =>
    list.map((d) =>
      d.id === destId
        ? { ...d, [slot]: d[slot].filter((doc) => doc.id !== docId) }
        : d,
    ),
  )
}

/* -------------------------------------------------------------------------- */
/*  Day entries: attractions + reservations                                    */
/* -------------------------------------------------------------------------- */

function mutateDay(key, fn) {
  commit({
    ...state,
    days: { ...state.days, [key]: fn(getDay(state, key)) },
  })
}

export function addAttraction(key, partial = {}) {
  mutateDay(key, (day) => {
    const next = [...day.attractions]
    // The one that used to be last now needs a leg on to the newcomer.
    if (next.length > 0) {
      const prev = next[next.length - 1]
      next[next.length - 1] = {
        ...prev,
        legOut: prev.legOut ?? { mode: 'walk', durationMin: 0, distanceKm: 0 },
      }
    }
    next.push(makeAttraction({ ...partial, legOut: null }))
    return { ...day, attractions: next }
  })
}

/**
 * Route legs describe "how you leave this stop", so they belong to the slot in
 * the day, not to the attraction being dragged. Detach, reorder, re-attach by
 * index — the same rule the destination list uses.
 */
function relinkLegs(list) {
  const legs = list.map((a) => a.legOut)
  return list.map((a, i) => ({
    ...a,
    legOut: i === list.length - 1 ? null : (legs[i] ?? null),
  }))
}

export function reorderAttraction(key, from, to) {
  mutateDay(key, (day) => {
    const list = day.attractions
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
      return day
    }
    const next = list.map((a) => ({ ...a, legOut: null }))
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    // Legs stay with the positions they described, not with the moved item.
    const legs = list.map((a) => a.legOut)
    return {
      ...day,
      attractions: next.map((a, i) => ({
        ...a,
        legOut: i === next.length - 1 ? null : (legs[i] ?? null),
      })),
    }
  })
}

export function setAttractionLeg(key, attractionId, patch) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: day.attractions.map((a) =>
      a.id === attractionId
        ? {
            ...a,
            legOut: {
              mode: 'walk',
              durationMin: 0,
              distanceKm: 0,
              ...a.legOut,
              ...patch,
            },
          }
        : a,
    ),
  }))
}

export function updateAttraction(key, id, patch) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: day.attractions.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    ),
  }))
}

export function removeAttraction(key, id) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: relinkLegs(day.attractions.filter((a) => a.id !== id)),
  }))
}

export function addReservation(key, partial = {}) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: [...day.reservations, makeReservation(partial)],
  }))
}

export function updateReservation(key, id, patch) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === id ? { ...r, ...patch } : r,
    ),
  }))
}

export function removeReservation(key, id) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.filter((r) => r.id !== id),
  }))
}

export function addReservationDoc(key, reservationId, meta) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === reservationId ? { ...r, documents: [...r.documents, meta] } : r,
    ),
  }))
}

export function removeReservationDoc(key, reservationId, docId) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === reservationId
        ? { ...r, documents: r.documents.filter((d) => d.id !== docId) }
        : r,
    ),
  }))
}

/* --- per-day accommodation ------------------------------------------------- */

/** Opt this night out of the destination's accommodation. */
export function addDayAccommodation(key, partial = {}) {
  mutateDay(key, (day) => ({
    ...day,
    accommodation: day.accommodation ?? makeDayAccommodation(partial),
  }))
}

export function updateDayAccommodation(key, patch) {
  mutateDay(key, (day) => ({
    ...day,
    accommodation: makeDayAccommodation({ ...day.accommodation, ...patch }),
  }))
}

/** Drop back to inheriting the destination's accommodation. */
export function removeDayAccommodation(key) {
  mutateDay(key, (day) => ({ ...day, accommodation: null }))
}

export function addDayAccommodationDoc(key, meta) {
  mutateDay(key, (day) => {
    const current = day.accommodation ?? makeDayAccommodation()
    return {
      ...day,
      accommodation: { ...current, documents: [...current.documents, meta] },
    }
  })
}

export function removeDayAccommodationDoc(key, docId) {
  mutateDay(key, (day) => {
    if (!day.accommodation) return day
    return {
      ...day,
      accommodation: {
        ...day.accommodation,
        documents: day.accommodation.documents.filter((d) => d.id !== docId),
      },
    }
  })
}

export function resetTrip() {
  commit(seedTrip())
}

/* -------------------------------------------------------------------------- */
/*  Derived data                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Walk the itinerary from the start date, handing each stop the arrival and
 * departure dates implied by the nights before it.
 */
export function withDates(trip) {
  let cursor = parseISO(trip.startDate)
  return trip.destinations.map((d) => {
    const start = cursor
    const end = addDays(start, d.nights)
    cursor = end
    return { ...d, startDate: start, endDate: end }
  })
}

/** Every night of the trip, in order, with its day entry resolved. */
export function tripDays(trip, destinations = withDates(trip)) {
  const days = []
  destinations.forEach((dest, destIndex) => {
    for (let n = 0; n < dest.nights; n += 1) {
      const key = dayKey(dest.id, n)
      days.push({
        key,
        date: addDays(dest.startDate, n),
        dest,
        destIndex,
        nightIndex: n,
        entry: getDay(trip, key),
        // The travel leg belongs to the last night at each stop.
        leg: n === dest.nights - 1 ? legOf(dest) : [],
        next: n === dest.nights - 1 ? destinations[destIndex + 1] : null,
      })
    }
  })
  return days
}

/** Only days that actually exist count — orphaned entries are excluded. */
function liveDayEntries(trip) {
  return trip.destinations.flatMap((dest) =>
    Array.from({ length: dest.nights }, (_, n) =>
      getDay(trip, dayKey(dest.id, n)),
    ),
  )
}

/**
 * What a stop costs to sleep at, night by night.
 *
 * A night with its own accommodation *replaces* the destination's nightly rate
 * rather than adding to it — you only sleep in one bed a night, so counting
 * both would inflate the budget.
 */
function sleepingCost(trip, dest) {
  const nightly = num(dest.sleeping?.cost)
  return Array.from({ length: dest.nights }, (_, n) => {
    const override = getDay(trip, dayKey(dest.id, n)).accommodation
    return override ? num(override.cost) : nightly
  }).reduce((sum, cost) => sum + cost, 0)
}

export function tripStats(trip) {
  const plannedNights = trip.destinations.reduce((sum, d) => sum + d.nights, 0)
  const totalNights = Math.max(
    0,
    differenceInCalendarDays(parseISO(trip.endDate), parseISO(trip.startDate)),
  )

  const sleeping = trip.destinations.reduce(
    (sum, d) => sum + sleepingCost(trip, d),
    0,
  )
  const transport = trip.destinations.reduce(
    (sum, d) => sum + legTotals(d).cost,
    0,
  )

  const entries = liveDayEntries(trip)
  const attractions = entries.reduce(
    (sum, day) => sum + day.attractions.reduce((s, a) => s + num(a.cost), 0),
    0,
  )
  const reservations = entries.reduce(
    (sum, day) => sum + day.reservations.reduce((s, r) => s + num(r.cost), 0),
    0,
  )

  const done = entries.reduce(
    (sum, day) =>
      sum +
      day.attractions.filter((a) => a.done).length +
      day.reservations.filter((r) => r.done).length,
    0,
  )
  const planned = entries.reduce(
    (sum, day) => sum + day.attractions.length + day.reservations.length,
    0,
  )

  return {
    plannedNights,
    totalNights,
    unplannedNights: Math.max(0, totalNights - plannedNights),
    overplanned: plannedNights > totalNights,
    sleeping,
    transport,
    attractions,
    reservations,
    itemsDone: done,
    itemsPlanned: planned,
    total: sleeping + transport + attractions + reservations,
  }
}

/** Cost attributable to a single stop, used by the budget breakdown. */
export function destinationCost(trip, dest) {
  const dayCosts = Array.from({ length: dest.nights }, (_, n) =>
    getDay(trip, dayKey(dest.id, n)),
  ).reduce(
    (sum, day) =>
      sum +
      day.attractions.reduce((s, a) => s + num(a.cost), 0) +
      day.reservations.reduce((s, r) => s + num(r.cost), 0),
    0,
  )

  return sleepingCost(trip, dest) + legTotals(dest).cost + dayCosts
}

export function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export const formatDay = (date) =>
  format(date, 'EEE d MMM', { locale: currentDateLocale() })
