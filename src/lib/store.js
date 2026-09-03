import { useSyncExternalStore } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { currentDateLocale } from "./i18n.js";
import { hasSupabase, supabase } from "./supabase.js";
import {
  getLocalOnly,
  getSession,
  subscribeLocalOnly,
  subscribeSession,
} from "./auth.js";
import {
  loadAllOfflineTrips,
  isTripDownloaded,
  saveTripOffline,
} from "./offlineCache.js";
import { fetchPexelsPhotos, hasPexelsKey } from "./pexels.js";

const STORAGE_KEY = "project-travel:trip:v2";
const LEGACY_KEY = "project-travel:trip:v1";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * A trip's id doubles as its Supabase primary key, so it must be a real UUID
 * rather than the short `uid` used for in-trip entities. `crypto.randomUUID`
 * covers every modern browser on http(s)/localhost; the fallback keeps the app
 * working if it's ever opened from a bare `file://` URL (a non-secure context).
 */
const newId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/**
 * Each mode carries its own colour so a leg reads the same way in the list, on
 * the map and in the legend. Train keeps the brand teal; the rest fan out into
 * hues that stay legible on top of a colourful basemap.
 *
 * "none" (no transport chosen) is deliberately not part of this list — it's
 * the passive default a leg is born with, never an option in the mode picker
 * itself, so it's handled separately below.
 */
export const TRANSPORT_MODES = [
  { id: "plane", label: "Flight", color: "#E4572E" },
  { id: "train", label: "Train", color: "#17858F" },
  { id: "bus", label: "Bus", color: "#E8A33D" },
  { id: "car", label: "Car", color: "#6A4C93" },
  { id: "ferry", label: "Ferry", color: "#2E86C1" },
  { id: "walk", label: "Walk", color: "#57A773" },
];

const NO_TRANSPORT_COLOR = "#8a8f98";

export function modeColor(mode) {
  if (mode === "none") return NO_TRANSPORT_COLOR;
  return TRANSPORT_MODES.find((m) => m.id === mode)?.color ?? "#17858F";
}

export function modeLabel(mode) {
  if (mode === "none") return "No transport";
  return TRANSPORT_MODES.find((m) => m.id === mode)?.label ?? "Travel";
}

export const CURRENCIES = [
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
  { code: "ILS", symbol: "₪" },
  { code: "THB", symbol: "฿" },
  { code: "JPY", symbol: "¥" },
];

/** Document slots that hang off a destination. */
export const DOC_SLOTS = ["travelDocs", "sleepingDocs"];

/** An empty station: a name the user typed, optionally geocoded. */
const emptyStation = () => ({ name: "", lat: 0, lng: 0 });

/**
 * One hop of a journey between two destinations. A leg is an array of these,
 * so "bus to the airport, flight, train into town" is three segments rather
 * than one lossy "plane".
 */
export function makeSegment(partial = {}) {
  const { origin, destination, ...rest } = partial;
  return {
    id: uid(),
    mode: "train",
    durationMin: 0,
    distanceKm: 0,
    cost: 0,
    documents: [],
    ...rest,
    origin: { ...emptyStation(), ...origin },
    destination: { ...emptyStation(), ...destination },
  };
}

/** Segments leaving a destination; always an array, empty for the last stop. */
export const legOf = (dest) =>
  Array.isArray(dest?.transportOut) ? dest.transportOut : [];

export function legTotals(dest) {
  return legOf(dest).reduce(
    (acc, s) => ({
      durationMin: acc.durationMin + num(s.durationMin),
      distanceKm: acc.distanceKm + num(s.distanceKm),
      cost: acc.cost + num(s.cost),
    }),
    { durationMin: 0, distanceKm: 0, cost: 0 },
  );
}

function makeDestination(partial = {}) {
  return {
    id: uid(),
    name: "New destination",
    country: "",
    lat: 0,
    lng: 0,
    nights: 2,
    sleeping: { name: "", cost: 0, address: "" },
    notes: "",
    // A Pexels photo of the destination, filled in lazily after it's placed.
    photoUrl: "",
    travelDocs: [],
    sleepingDocs: [],
    // Segments leaving THIS destination for the next one. Empty on the last.
    transportOut: [],
    ...partial,
  };
}

/**
 * The trip's optional starting point (e.g. home) — exists purely to carry a
 * transport leg into the first real destination. Deliberately has no
 * `nights`/attractions/sleeping and is never placed on the map or numbered:
 * it's not a stop, just where the story (and the route) begins.
 */
function makeOrigin(partial = {}) {
  return {
    id: uid(),
    name: "",
    country: "",
    lat: 0,
    lng: 0,
    transportOut: [],
    // Off by default — most trips don't want a pin for "home".
    showOnMap: false,
    ...partial,
  };
}

/**
 * The trip's optional final stop (e.g. flying back home) — the mirror image
 * of the origin. Unlike the origin it carries no `transportOut` of its own:
 * nothing leaves it, so the leg INTO it lives on the last real destination's
 * `transportOut`, exactly like any other destination-to-destination leg.
 */
function makeLastStop(partial = {}) {
  return {
    id: uid(),
    name: "",
    country: "",
    lat: 0,
    lng: 0,
    showOnMap: false,
    // Shortcut for a round trip: mirrors the origin's place instead of
    // keeping its own, and stays in sync if the origin is edited later.
    sameAsOrigin: false,
    ...partial,
  };
}

/**
 * Days are addressed by the stop they belong to plus how many nights in, so
 * entries stay attached to their place in the itinerary when the trip start
 * date moves. Trimming nights leaves an entry orphaned but intact — add the
 * night back and it returns.
 */
export const dayKey = (destId, nightIndex) => `${destId}:${nightIndex}`;

const EMPTY_DAY = { attractions: [], reservations: [], accommodation: null };

/**
 * A night's own accommodation.
 *
 * `null` means the day inherits whatever the destination has, which is the
 * common case. Adding one overrides just that night — for a mid-stay hotel
 * change — and carries its own documents.
 */
export function makeDayAccommodation(partial = {}) {
  return {
    name: "",
    cost: 0,
    address: "",
    notes: "",
    documents: [],
    ...partial,
  };
}

export function makeAttraction(partial = {}) {
  return {
    id: uid(),
    name: "",
    time: "",
    cost: 0,
    done: false,
    lat: 0,
    lng: 0,
    address: "",
    // Carried over when the attraction came from a business listing.
    phone: "",
    website: "",
    openingHours: "",
    // How you travel from THIS attraction to the next one that day.
    legOut: null,
    ...partial,
  };
}

export function makeReservation(partial = {}) {
  return {
    id: uid(),
    name: "",
    time: "",
    cost: 0,
    done: false,
    documents: [],
    ...partial,
  };
}

export function getDay(trip, key) {
  const day = trip.days?.[key];
  if (!day) return EMPTY_DAY;
  return {
    attractions: day.attractions ?? [],
    reservations: day.reservations ?? [],
    accommodation: day.accommodation ?? null,
  };
}

/** A stop is only routable once it has real coordinates. */
export const isPlaced = (p) =>
  Number.isFinite(p?.lat) &&
  Number.isFinite(p?.lng) &&
  !(p.lat === 0 && p.lng === 0);

function seedTrip() {
  const dest = (name, country, lat, lng, nights, transportOut) =>
    makeDestination({ name, country, lat, lng, nights, transportOut });

  return {
    title: "An Italian Adventure",
    emoji: "🌍",
    startDate: "2026-06-09",
    endDate: "2026-06-25",
    currency: "EUR",
    days: {},
    destinations: [
      dest("Milano", "Italy", 45.4642, 9.19, 2, [
        makeSegment({
          mode: "train",
          durationMin: 147,
          distanceKm: 280,
          cost: 42,
        }),
      ]),
      dest("Venice", "Italy", 45.4408, 12.3155, 3, [
        makeSegment({
          mode: "train",
          durationMin: 133,
          distanceKm: 258,
          cost: 38,
        }),
      ]),
      dest("Florence", "Italy", 43.7696, 11.2558, 3, [
        makeSegment({
          mode: "car",
          durationMin: 180,
          distanceKm: 231,
          cost: 60,
        }),
      ]),
      dest("Rome", "Italy", 41.9028, 12.4964, 4, []),
    ],
  };
}

/**
 * The baseline fields every trip carries. Kept separate from the demo
 * `seedTrip` so a stored trip that predates a field is filled in with empty
 * defaults, never with demo content — only a genuinely first-run app (no
 * storage at all) is handed the sample trip.
 */
function tripDefaults() {
  const today = new Date();
  return {
    id: newId(),
    title: "New trip",
    emoji: "🌍",
    // A Pexels photo of the first destination's country; empty means the
    // emoji still stands in for it.
    photoUrl: "",
    // An uploaded cover photo (a doc reference into IndexedDB/Storage). When
    // set it supersedes photoUrl and the emoji.
    coverDoc: null,
    startDate: format(today, "yyyy-MM-dd"),
    endDate: format(addDays(today, 1), "yyyy-MM-dd"),
    currency: "EUR",
    days: {},
    destinations: [],
    // Absent for almost every trip — only set once the user opts in.
    origin: null,
    lastStop: null,
    // Client write-time, compared against the Supabase row's updated_at for
    // last-write-wins sync. Bumped on every commit.
    updatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** Fill in anything a stored payload predates or is missing. */
export function normalize(trip) {
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
  );

  return {
    ...tripDefaults(),
    ...trip,
    days,
    destinations: (trip.destinations ?? []).map((d) => ({
      ...makeDestination(),
      ...d,
      sleeping: { name: "", cost: 0, address: "", ...d.sleeping },
      travelDocs: d.travelDocs ?? [],
      sleepingDocs: d.sleepingDocs ?? [],
      transportOut: normalizeLeg(d.transportOut),
    })),
    origin: trip.origin
      ? {
          ...makeOrigin(),
          ...trip.origin,
          transportOut: normalizeLeg(trip.origin.transportOut),
        }
      : null,
    lastStop: trip.lastStop ? { ...makeLastStop(), ...trip.lastStop } : null,
  };
}

/**
 * Resolves what the last stop actually is: its own place, or — opted in via
 * `sameAsOrigin` — a live mirror of the trip origin, so editing the origin
 * later keeps them in sync instead of leaving a stale copy behind. Falls back
 * to the last stop's own (possibly blank) fields if the origin was removed.
 */
export function effectiveLastStop(trip) {
  if (!trip.lastStop) return null;
  if (trip.lastStop.sameAsOrigin && trip.origin) {
    return {
      ...trip.lastStop,
      name: trip.origin.name,
      country: trip.origin.country,
      lat: trip.origin.lat,
      lng: trip.origin.lng,
    };
  }
  return trip.lastStop;
}

/**
 * Legs used to be a single `{ mode, durationMin, distanceKm, cost }` object.
 * They are now an ordered list of segments; an old leg becomes a one-segment
 * journey so nothing is lost.
 */
function normalizeLeg(leg) {
  if (Array.isArray(leg)) return leg.map((s) => makeSegment(s));
  if (leg && typeof leg === "object") return [makeSegment(leg)];
  return [];
}

/**
 * v1 kept a single `documents` list per stop and `activities` on the stop
 * rather than on a day. Travel paperwork is the better default for existing
 * uploads, and activities land on the first night of their stop.
 */
function migrateV1(old) {
  if (!old || !Array.isArray(old.destinations)) return seedTrip();

  const days = {};
  const destinations = old.destinations.map((dest) => {
    const { activities, documents, ...rest } = dest;

    if (Array.isArray(activities) && activities.length > 0) {
      days[dayKey(dest.id, 0)] = {
        attractions: activities.map((a) =>
          makeAttraction({ id: a.id, name: a.name ?? "", cost: num(a.cost) }),
        ),
        reservations: [],
      };
    }

    return {
      ...makeDestination(),
      ...rest,
      travelDocs: documents ?? [],
      sleepingDocs: [],
    };
  });

  return normalize({ ...old, destinations, days });
}

/*
 * Multi-trip storage.
 *
 * Each trip is persisted under its own key (`project-travel:trip:<id>`) and a
 * small index (`project-travel:index`) records their order and which one is
 * active. The active trip is mirrored in `state`, so every screen — which reads
 * `useTrip()` and calls the mutations below — is untouched by there now being
 * more than one trip; it only ever sees the active one.
 */
const INDEX_KEY = "project-travel:index";
const tripKey = (id) => `project-travel:trip:${id}`;

function persistTrip(trip) {
  if (cloudModeActive) return;
  try {
    localStorage.setItem(tripKey(trip.id), JSON.stringify(trip));
  } catch {
    // Quota or private-mode failure — the in-memory copy stays usable.
  }
}

function persistIndex() {
  if (cloudModeActive) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify({ activeId, ids: order }));
  } catch {
    // Non-fatal: ordering/active just won't survive a reload.
  }
}

/* -------------------------------------------------------------------------- */
/*  Cloud sync (Supabase)                                                      */
/*                                                                              */
/*  Signed in: `public.trips` is the only source of truth — nothing is ever   */
/*  written to localStorage (see `cloudModeActive` guards on persistTrip /     */
/*  persistIndex above). Local-only (no account): unchanged, localStorage as   */
/*  always. `enterCloudMode`/`enterLocalMode` swap the in-memory trip set      */
/*  when that boundary is crossed; `downloadTripOffline` is the one explicit   */
/*  escape hatch for using a cloud trip without a network connection.         */
/* -------------------------------------------------------------------------- */

const PUSH_DEBOUNCE_MS = 1500;
const pushTimers = new Map();

function isOnline() {
  // Only an explicit `false` counts as offline — environments without a real
  // Navigator (Node, tests) leave this undefined and should be treated as online.
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Push a brand-new trip to the cloud (create, adopt, or reseed) — the only
 *  paths where the current user is establishing themselves as the owner.
 *  Returns true only on a confirmed write — the adoption path relies on this
 *  to know a local trip is safe to drop. Also exported for callers that need
 *  to guarantee a trip's row exists before writing something that references
 *  it (e.g. a Storage object whose RLS check looks the trip up by id). */
export async function upsertTripNow(trip) {
  const session = getSession();
  if (!hasSupabase || !session) return false;
  const { error } = await supabase.from("trips").upsert({
    id: trip.id,
    owner_id: session.user.id,
    data: trip,
    updated_at: trip.updatedAt,
  });
  if (error) {
    console.error("Cloud sync: failed to push trip", error);
    return false;
  }
  return true;
}

/** Push an edit to a trip that already exists remotely. Deliberately never
 *  touches owner_id — an editor collaborator saving a change must not be able
 *  to reassign ownership away from the real owner (also enforced server-side
 *  by a trigger; this is belt-and-suspenders — see supabase/schema.sql). */
async function updateTripRemote(trip) {
  const session = getSession();
  if (!hasSupabase || !session) return false;
  const { error } = await supabase
    .from("trips")
    .update({ data: trip, updated_at: trip.updatedAt })
    .eq("id", trip.id);
  if (error) {
    console.error("Cloud sync: failed to push trip", error);
    return false;
  }
  return true;
}

function pushTrip(trip, { immediate = false } = {}) {
  if (!hasSupabase || !getSession()) return;

  const existing = pushTimers.get(trip.id);
  if (existing) clearTimeout(existing);

  if (immediate) {
    pushTimers.delete(trip.id);
    updateTripRemote(trip);
  } else {
    pushTimers.set(
      trip.id,
      setTimeout(() => {
        pushTimers.delete(trip.id);
        updateTripRemote(trip);
      }, PUSH_DEBOUNCE_MS),
    );
  }
}

function deleteTripRemote(id) {
  const timer = pushTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    pushTimers.delete(id);
  }
  if (!hasSupabase) return;
  const session = getSession();
  if (!session) return;
  supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("Cloud sync: failed to delete trip", error);
    });
}

/**
 * Cross into cloud mode (sign-in): if there was a real local-only trip set,
 * adopt it into the account (push, then wipe it from localStorage — it now
 * lives in the cloud only), then load the authoritative list from the DB. If
 * the fetch itself fails (offline), fall back to whatever's been explicitly
 * downloaded for offline use rather than showing nothing.
 */
async function enterCloudMode(previousMode) {
  const session = getSession();
  if (!session) return;

  const adopting = previousMode === "local";
  // Which local trips the cloud has *confirmed* it stored. Only these may be
  // dropped from localStorage below; a swallowed push failure must never cost
  // the user a trip.
  let adoptedIds = new Set();
  if (adopting) {
    const ids = [...order];
    const results = await Promise.all(
      ids.map((id) => upsertTripNow(trips.get(id))),
    );
    adoptedIds = new Set(ids.filter((_, i) => results[i]));
  }

  const [{ data, error }, { data: memberships, error: membershipError }] =
    await Promise.all([
      supabase
        .from("trips")
        .select("id, data, updated_at")
        .eq("owner_id", session.user.id),
      supabase
        .from("trip_members")
        .select("trip_id, status")
        .eq("user_id", session.user.id),
    ]);

  if (error) {
    console.error("Cloud sync: failed to fetch trips", error);
    const offline = await loadAllOfflineTrips();
    if (offline.length > 0) {
      trips = new Map(offline.map((t) => [t.id, normalize(t)]));
      order = offline.map((t) => t.id);
      activeId = trips.has(activeId) ? activeId : order[0];
      state = trips.get(activeId);
    }
    // Otherwise leave whatever was already showing (e.g. the placeholder) —
    // it's stale but better than a blank app.
    cloudModeActive = true;
    tripsReady = true;
    invitations = [];
    listeners.forEach((l) => l());
    refreshRegistry();
    notifyInvitations();
    return;
  }

  // Trips owned by someone else but shared with this user — either already
  // accepted (editable, merged below into the normal trip set) or still
  // awaiting a decision (kept separate in `invitations`, never merged).
  if (membershipError) {
    console.error("Cloud sync: failed to fetch shared trips", membershipError);
  }
  const accepted = (memberships ?? []).filter((m) => m.status === "accepted");
  const acceptedIds = new Set(accepted.map((m) => m.trip_id));
  const allSharedIds = (memberships ?? []).map((m) => m.trip_id);

  let memberRows = [];
  let pendingRows = [];
  if (allSharedIds.length > 0) {
    const { data: shared, error: sharedError } = await supabase
      .from("trips")
      .select("id, data, updated_at")
      .in("id", allSharedIds);
    if (sharedError) {
      console.error("Cloud sync: failed to fetch shared trips", sharedError);
    } else {
      memberRows = (shared ?? []).filter((r) => acceptedIds.has(r.id));
      pendingRows = (shared ?? []).filter((r) => !acceptedIds.has(r.id));
    }
  }

  if (adopting) clearAdoptedLocalStorage(adoptedIds);
  cloudModeActive = true;
  tripsReady = true;
  invitations = pendingRows.map((row) => {
    const t = normalize(row.data);
    return {
      id: row.id,
      title: t.title,
      emoji: t.emoji,
      photoUrl: t.photoUrl,
      coverDoc: t.coverDoc,
      startDate: t.startDate,
      endDate: t.endDate,
    };
  });

  const ownedRows = data ?? [];
  if (ownedRows.length === 0 && memberRows.length === 0) {
    // Brand-new account, nothing adopted and nothing in the cloud yet.
    const seed = normalize(seedTrip());
    trips = new Map([[seed.id, seed]]);
    order = [seed.id];
    activeId = seed.id;
    state = seed;
    tripRoles = new Map([[seed.id, "owner"]]);
    upsertTripNow(seed);
  } else {
    trips = new Map(
      [...ownedRows, ...memberRows].map((row) => [row.id, normalize(row.data)]),
    );
    order = [...ownedRows.map((r) => r.id), ...memberRows.map((r) => r.id)];
    tripRoles = new Map([
      ...ownedRows.map((r) => [r.id, "owner"]),
      ...memberRows.map((r) => [r.id, "editor"]),
    ]);
    activeId = trips.has(activeId) ? activeId : order[0];
    state = trips.get(activeId);
  }

  listeners.forEach((l) => l());
  refreshRegistry();
  notifyInvitations();
}

/** Cross into (or back into) local-only mode: reload straight from localStorage. */
function enterLocalMode() {
  cloudModeActive = false;
  tripRoles = new Map();
  invitations = [];
  const loaded = loadAll();
  trips = loaded.map;
  order = loaded.order;
  activeId = loaded.activeId;
  state = trips.get(activeId);
  tripsReady = true;
  listeners.forEach((l) => l());
  refreshRegistry();
  notifyInvitations();
}

/**
 * After adopting local trips into a freshly signed-in account, drop from
 * localStorage only the trips the cloud confirmed it stored (`adoptedIds`). Any
 * trip whose push failed is left in place — and if even one failed, the index
 * is kept too — so a later sign-out still finds the survivors (loadAll simply
 * skips the adopted keys that are now gone). This closes the earlier data-loss
 * path where a swallowed push error still wiped the trip locally.
 */
function clearAdoptedLocalStorage(adoptedIds) {
  try {
    for (const id of order) {
      if (adoptedIds.has(id)) localStorage.removeItem(tripKey(id));
    }
    if (order.every((id) => adoptedIds.has(id))) {
      localStorage.removeItem(INDEX_KEY);
    } else {
      const failed = order.filter((id) => !adoptedIds.has(id)).length;
      console.warn(
        `Cloud sync: ${failed} trip(s) failed to adopt into the account; kept in local storage as a fallback.`,
      );
    }
  } catch {
    // Non-fatal — the cloud copy is authoritative from here on regardless.
  }
}

function currentAuthMode() {
  if (getSession()) return "cloud";
  if (!hasSupabase || getLocalOnly()) return "local";
  return "pending"; // AuthScreen is showing; no trip data is needed yet.
}

let activeMode = hasSupabase ? "pending" : "local";

function syncAuthMode() {
  const next = currentAuthMode();
  if (next === activeMode) return;
  const previous = activeMode;
  activeMode = next;
  if (next === "cloud") enterCloudMode(previous);
  else if (next === "local") enterLocalMode();
}

/**
 * Load every stored trip, or migrate the old single-trip keys (v2, then v1) on
 * the first run of the multi-trip build. As with the earlier v1→v2 migration,
 * the legacy keys are left in place as a fallback rather than deleted.
 */
function loadAll() {
  try {
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null");
    if (index && Array.isArray(index.ids) && index.ids.length > 0) {
      const map = new Map();
      const ids = [];
      for (const id of index.ids) {
        const raw = localStorage.getItem(tripKey(id));
        if (!raw) continue;
        try {
          const trip = normalize(JSON.parse(raw));
          map.set(trip.id, trip);
          ids.push(trip.id);
        } catch {
          // Skip one corrupt trip rather than losing the whole set.
        }
      }
      if (map.size > 0) {
        const active = map.has(index.activeId) ? index.activeId : ids[0];
        return { map, order: ids, activeId: active };
      }
    }
    return migrateLegacy();
  } catch {
    return migrateLegacy();
  }
}

function migrateLegacy() {
  let base = null;
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed && Array.isArray(parsed.destinations))
        base = normalize(parsed);
    }
    if (!base) {
      const v1 = localStorage.getItem(LEGACY_KEY);
      if (v1) base = migrateV1(JSON.parse(v1));
    }
  } catch {
    // Fall through to a freshly seeded trip.
  }
  if (!base) base = normalize(seedTrip());

  // Write the new format straight away so the migration is durable, keeping the
  // legacy v1/v2 keys untouched as a safety net.
  persistTrip(base);
  if (!cloudModeActive) {
    try {
      localStorage.setItem(
        INDEX_KEY,
        JSON.stringify({ activeId: base.id, ids: [base.id] }),
      );
    } catch {
      // Non-fatal.
    }
  }
  return {
    map: new Map([[base.id, base]]),
    order: [base.id],
    activeId: base.id,
  };
}

/**
 * Boot state. When Supabase isn't configured at all this is the final state
 * (pure local-only, as before). Otherwise it's a placeholder — never written
 * to localStorage — until `syncAuthMode`, triggered right below, learns
 * whether to load from localStorage (local-only) or the cloud.
 */
let cloudModeActive = false;
// True once the ACTIVE trip set is real data rather than the placeholder
// below — local-only apps have real data immediately; cloud apps flip this
// once the first fetch (or fallback) completes. Never reset afterwards, so a
// later sign-in/out swap doesn't re-blank the screen.
let tripsReady = !hasSupabase;
let trips;
let order;
let activeId;
let state;
// trip id -> 'owner' | 'editor'. Only meaningful in cloud mode — local-only
// trips have no ownership concept and default to 'owner' in the registry.
let tripRoles = new Map();
// Shared trips not yet accepted or declined — kept separate from `trips`/
// `order` so they never show as editable until the user actually accepts.
// `{ id, title, emoji, photoUrl, startDate, endDate }[]`, cloud mode only.
let invitations = [];
const invitationListeners = new Set();
function notifyInvitations() {
  invitationListeners.forEach((l) => l());
}
function subscribeInvitations(listener) {
  invitationListeners.add(listener);
  return () => invitationListeners.delete(listener);
}

if (hasSupabase) {
  const placeholder = normalize(seedTrip());
  trips = new Map([[placeholder.id, placeholder]]);
  order = [placeholder.id];
  activeId = placeholder.id;
  state = placeholder;
} else {
  const loaded = loadAll();
  trips = loaded.map;
  order = loaded.order;
  activeId = loaded.activeId;
  state = trips.get(activeId);
}

/* --- active-trip store: what every screen reads --------------------------- */

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether trips currently come from the cloud (vs. localStorage). */
export function useCloudMode() {
  return useSyncExternalStore(
    subscribe,
    () => cloudModeActive,
    () => cloudModeActive,
  );
}

/** Non-hook snapshot of cloud mode, for callers outside React (tests). */
export function isCloudMode() {
  return cloudModeActive;
}

/**
 * True once the active trip set is real (loaded from the cloud, or local-only
 * data) rather than the boot-time placeholder. Gates the initial screen so
 * the placeholder demo trip is never shown while the real fetch is in flight.
 */
export function useTripsReady() {
  return useSyncExternalStore(
    subscribe,
    () => tripsReady,
    () => tripsReady,
  );
}

function commit(next) {
  // Cloud mode with no connection is read-only — nothing could be saved
  // anyway, and the UI disables input for the same reason.
  if (cloudModeActive && !isOnline()) return;
  const stamped = { ...next, updatedAt: new Date().toISOString() };
  state = stamped;
  trips.set(activeId, stamped);
  persistTrip(stamped);
  pushTrip(stamped);
  listeners.forEach((l) => l());
  // A commit can change the title/emoji/dates shown in the switcher.
  refreshRegistry();
}

export function useTrip() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Non-hook snapshot of the active trip, for callers outside React (tests). */
export function getActiveTrip() {
  return state;
}

/* --- trip-registry store: the list of trips + which one is active --------- */

const registryListeners = new Set();

function computeRegistry() {
  return {
    activeId,
    trips: order.map((id) => {
      const trip = trips.get(id);
      return {
        id,
        title: trip.title,
        emoji: trip.emoji,
        photoUrl: trip.photoUrl,
        coverDoc: trip.coverDoc,
        startDate: trip.startDate,
        endDate: trip.endDate,
        // 'owner' everywhere in local-only mode (no ownership concept there);
        // defaults to the more restrictive 'editor' if cloud mode somehow
        // hasn't recorded a role yet, rather than assuming 'owner'.
        role: cloudModeActive ? (tripRoles.get(id) ?? "editor") : "owner",
      };
    }),
  };
}

let registry = computeRegistry();

/**
 * Rebuild the registry snapshot, notifying only when it actually changed, so a
 * keystroke in an unrelated field of the active trip doesn't re-render the
 * whole switcher. useSyncExternalStore also requires a stable reference while
 * nothing changed, which this preserves.
 */
function refreshRegistry() {
  const next = computeRegistry();
  if (JSON.stringify(next) === JSON.stringify(registry)) return;
  registry = next;
  registryListeners.forEach((l) => l());
}

function subscribeRegistry(listener) {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

export function useTripList() {
  return useSyncExternalStore(
    subscribeRegistry,
    () => registry,
    () => registry,
  );
}

/** The active user's role on a given trip ('owner' | 'editor'), or 'owner'
 *  for local-only trips. Drives Share/Delete visibility in the UI — actual
 *  enforcement always happens server-side (RLS). */
export function useTripRole(id) {
  const { trips: list } = useTripList();
  return list.find((t) => t.id === id)?.role ?? "owner";
}

/** Shared trips waiting on this user to accept or decline. */
export function useTripInvitations() {
  return useSyncExternalStore(
    subscribeInvitations,
    () => invitations,
    () => invitations,
  );
}

/** Non-hook snapshot of the trip registry, for callers outside React (tests). */
export function getTripRegistry() {
  return registry;
}

// Only now (registry + listeners exist) is it safe to let syncAuthMode run —
// enterLocalMode/enterCloudMode can fire synchronously and touch both.
if (hasSupabase) {
  subscribeSession(syncAuthMode);
  subscribeLocalOnly(syncAuthMode);
  syncAuthMode(); // localOnly is known synchronously; session may resolve later.
}

/** Create a new trip and switch to it; returns its id. */
export function createTrip(partial = {}) {
  if (cloudModeActive && !isOnline()) return activeId;
  const trip = normalize({ ...tripDefaults(), ...partial, id: newId() });
  trips.set(trip.id, trip);
  order = [...order, trip.id];
  activeId = trip.id;
  state = trip;
  persistTrip(trip);
  persistIndex();
  if (cloudModeActive) {
    tripRoles.set(trip.id, "owner");
    upsertTripNow(trip);
  }
  listeners.forEach((l) => l());
  refreshRegistry();
  return trip.id;
}

export function switchTrip(id) {
  if (id === activeId || !trips.has(id)) return;
  activeId = id;
  state = trips.get(id);
  persistIndex();
  listeners.forEach((l) => l());
  refreshRegistry();
}

export function deleteTrip(id) {
  if (!trips.has(id)) return;
  if (cloudModeActive && !isOnline()) return;
  trips.delete(id);
  order = order.filter((x) => x !== id);
  tripRoles.delete(id);
  deleteTripRemote(id);
  if (!cloudModeActive) {
    try {
      localStorage.removeItem(tripKey(id));
    } catch {
      // Non-fatal: the row is gone from the index either way.
    }
  }

  if (activeId === id) {
    if (order.length === 0) {
      // Never leave the app with no trip at all — seed a fresh one.
      const seed = normalize(seedTrip());
      trips.set(seed.id, seed);
      order = [seed.id];
      activeId = seed.id;
      persistTrip(seed);
      if (cloudModeActive) {
        tripRoles.set(seed.id, "owner");
        upsertTripNow(seed);
      }
    } else {
      activeId = order[0];
    }
    state = trips.get(activeId);
    listeners.forEach((l) => l());
  }
  persistIndex();
  refreshRegistry();
}

/**
 * Accept a shared-trip invitation: marks the membership accepted (which is
 * what actually grants edit access server-side — RLS checks it) and moves
 * the trip out of `invitations` into the normal, editable trip set.
 */
export async function acceptTripInvitation(tripId) {
  if (!hasSupabase) return;
  const session = getSession();
  if (!session) return;

  const { error } = await supabase
    .from("trip_members")
    .update({ status: "accepted" })
    .eq("trip_id", tripId)
    .eq("user_id", session.user.id);
  if (error) {
    console.error("Cloud sync: failed to accept trip invitation", error);
    return;
  }

  invitations = invitations.filter((t) => t.id !== tripId);
  notifyInvitations();

  const { data, error: fetchError } = await supabase
    .from("trips")
    .select("id, data, updated_at")
    .eq("id", tripId)
    .single();
  if (fetchError || !data) {
    console.error(
      "Cloud sync: accepted invitation but couldn't load the trip",
      fetchError,
    );
    return;
  }

  const trip = normalize(data.data);
  trips.set(trip.id, trip);
  order = [...order, trip.id];
  tripRoles.set(trip.id, "editor");
  listeners.forEach((l) => l());
  refreshRegistry();
}

/**
 * Leave a shared trip — declining an invitation before accepting it, or
 * removing an already-accepted one from your own list (e.g. it was shared by
 * mistake). Only ever removes YOUR OWN membership; the owner and the trip
 * itself are untouched.
 */
export async function leaveSharedTrip(tripId) {
  if (!hasSupabase) return;
  const session = getSession();
  if (!session) return;

  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", session.user.id);
  if (error) {
    console.error("Cloud sync: failed to leave shared trip", error);
    return;
  }

  if (invitations.some((t) => t.id === tripId)) {
    invitations = invitations.filter((t) => t.id !== tripId);
    notifyInvitations();
  }

  if (!trips.has(tripId)) return;
  trips.delete(tripId);
  order = order.filter((x) => x !== tripId);
  tripRoles.delete(tripId);

  if (activeId === tripId) {
    if (order.length === 0) {
      // Never leave the app with no trip at all — seed a fresh one.
      const seed = normalize(seedTrip());
      trips.set(seed.id, seed);
      order = [seed.id];
      activeId = seed.id;
      persistTrip(seed);
      tripRoles.set(seed.id, "owner");
      upsertTripNow(seed);
    } else {
      activeId = order[0];
    }
    state = trips.get(activeId);
  }
  listeners.forEach((l) => l());
  refreshRegistry();
}

/* -------------------------------------------------------------------------- */
/*  Offline downloads (cloud mode only)                                        */
/*                                                                              */
/*  An explicit, per-trip opt-in cache in IndexedDB (see offlineCache.js) so   */
/*  a cloud trip stays usable if the connection drops — separate from (and     */
/*  not kept in sync with) localStorage, which cloud-mode trips never touch.   */
/* -------------------------------------------------------------------------- */

export async function downloadTripOffline(id = activeId) {
  const trip = trips.get(id);
  if (!trip) return;
  await saveTripOffline(trip);
}

export async function checkTripDownloaded(id = activeId) {
  return isTripDownloaded(id);
}

/* -------------------------------------------------------------------------- */
/*  Trip + destination mutations                                               */
/* -------------------------------------------------------------------------- */

export function updateTrip(patch) {
  commit({ ...state, ...patch });
}

function mapDestinations(fn) {
  commit({ ...state, destinations: fn(state.destinations) });
}

export function addDestination(partial) {
  const wasFirst = state.destinations.length === 0;
  mapDestinations((list) => {
    const next = [...list];
    // The stop that used to be last now needs a leg out to the newcomer.
    if (next.length > 0) {
      const prev = next[next.length - 1];
      next[next.length - 1] = {
        ...prev,
        transportOut: legOf(prev).length
          ? prev.transportOut
          : [makeSegment({ mode: "none" })],
      };
    }
    next.push(
      makeDestination({
        ...partial,
        // If a last stop is waiting, this newcomer needs a leg out to it too.
        transportOut: state.lastStop ? [makeSegment({ mode: "none" })] : [],
      }),
    );
    return next;
  });
  if (wasFirst) maybeAutoTripPhoto();
}

/**
 * A Pexels photo of a trip's first stop's country — the source for the auto
 * trip cover. Returns "" when there's no stop to key off or nothing is found.
 */
async function fetchCountryPhotoFor(trip) {
  const first = trip.destinations?.[0];
  const query = first?.country || first?.name;
  if (!query) return "";
  const [url] = await fetchPexelsPhotos(query, { perPage: 1 });
  return url || "";
}

/**
 * Give a brand-new trip a picture once it has a first stop: a Places photo of
 * that stop's country. Skipped when the trip already has a picture (so a manual
 * choice is never overwritten) or when there's no Google key. Best-effort — a
 * failure just leaves the emoji in place.
 */
async function maybeAutoTripPhoto() {
  if (state.photoUrl || state.coverDoc || !hasPexelsKey()) return;
  const tripId = state.id;
  try {
    const url = await fetchCountryPhotoFor(state);
    // The user may have switched trips or set a picture while this was in
    // flight — only apply if the same trip is still bare.
    if (url && state.id === tripId && !state.photoUrl)
      updateTrip({ photoUrl: url });
  } catch {
    /* leave the emoji */
  }
}

export function updateDestination(id, patch) {
  mapDestinations((list) =>
    list.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  );
}

// Destinations we've already tried to fetch a photo for this session, so a
// failed lookup isn't retried on every re-render of its row.
const destPhotoTried = new Set();

/**
 * Give a placed destination a Places photo of its landmarks, once. Best-effort
 * and idempotent: no-ops without a key, when the stop already has a photo or
 * isn't placed, and never retries the same stop within a session. Called lazily
 * from the row so both new and pre-existing stops get filled in.
 */
export async function ensureDestinationPhoto(destId) {
  if (!hasPexelsKey()) return;
  const dest = state.destinations.find((d) => d.id === destId);
  if (!dest || dest.photoUrl || !isPlaced(dest)) return;

  const query = dest.name || dest.country;
  if (!query) return;
  const tried = `${state.id}:${destId}`;
  if (destPhotoTried.has(tried)) return;
  destPhotoTried.add(tried);

  const tripId = state.id;
  try {
    const [url] = await fetchPexelsPhotos(query, { perPage: 1 });
    if (url && state.id === tripId) {
      // The stop may have been removed or filled meanwhile — re-check before write.
      const current = state.destinations.find((d) => d.id === destId);
      if (current && !current.photoUrl)
        updateDestination(destId, { photoUrl: url });
    } else if (!url) {
      // Nothing found this time — let a later attempt retry rather than
      // permanently giving up on this stop.
      destPhotoTried.delete(tried);
    }
  } catch {
    // Transient (cold SDK, network) — clear the flag so a re-render retries.
    destPhotoTried.delete(tried);
  }
}

/** Full trip object for an id (any trip, not just the active one). */
export function getTripById(id) {
  return trips.get(id);
}

/**
 * Set (or clear, with `null`) a trip's uploaded cover photo, by id — so the
 * picker can change a trip that isn't the active one. The blob lives in
 * IndexedDB (and, signed in, Storage); this only records the reference and
 * clears any remote photo it supersedes.
 */
export function setTripCover(tripId, coverDoc) {
  if (cloudModeActive && !isOnline()) return;
  const trip = trips.get(tripId);
  if (!trip) return;
  const next = {
    ...trip,
    coverDoc: coverDoc || null,
    photoUrl: "",
    updatedAt: new Date().toISOString(),
  };
  trips.set(tripId, next);
  if (tripId === activeId) {
    state = next;
    listeners.forEach((l) => l());
  }
  persistTrip(next);
  pushTrip(next);
  refreshRegistry();
}

export function removeDestination(id) {
  const next = state.destinations.filter((d) => d.id !== id);
  // Whatever ends up last must not keep a dangling leg — unless a last stop
  // is waiting for one, in which case make sure it still has a leg out.
  if (next.length > 0) {
    const last = next[next.length - 1];
    next[next.length - 1] = {
      ...last,
      transportOut: state.lastStop
        ? legOf(last).length
          ? last.transportOut
          : [makeSegment({ mode: "none" })]
        : [],
    };
  }

  // Drop the removed stop's days too, or they linger forever.
  const days = Object.fromEntries(
    Object.entries(state.days).filter(([key]) => !key.startsWith(`${id}:`)),
  );

  commit({ ...state, destinations: next, days });
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
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= list.length ||
      to >= list.length
    ) {
      return list;
    }

    const legs = list.map((d) => legOf(d));
    const next = list.map((d) => ({ ...d, transportOut: [] }));
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    return next.map((d, i) => {
      if (i !== next.length - 1) return { ...d, transportOut: legs[i] ?? [] };
      // The new last position keeps nothing after it — unless a last stop is
      // waiting, in which case it needs a leg out just like any other stop.
      if (!state.lastStop) return { ...d, transportOut: [] };
      const existing = legs[i] ?? [];
      return {
        ...d,
        transportOut: existing.length
          ? existing
          : [makeSegment({ mode: "none" })],
      };
    });
  });
}

export function moveDestination(id, direction) {
  const from = state.destinations.findIndex((d) => d.id === id);
  if (from < 0) return;
  reorderDestinations(from, from + direction);
}

export function setNights(id, nights) {
  updateDestination(id, { nights: Math.max(0, Math.min(365, nights)) });
}

/* --- trip origin ------------------------------------------------------------ */

export function addOrigin(partial = {}) {
  commit({ ...state, origin: makeOrigin(partial) });
}

export function updateOrigin(patch) {
  if (!state.origin) return;
  commit({ ...state, origin: { ...state.origin, ...patch } });
}

export function removeOrigin() {
  commit({ ...state, origin: null });
}

/* --- trip last stop ---------------------------------------------------- */

export function addLastStop(partial = {}) {
  const dests = state.destinations;
  const last = dests[dests.length - 1];
  // The last real destination now needs a leg out to the newcomer, same as
  // when a new destination is appended.
  const needsSegment = last && !legOf(last).length;
  commit({
    ...state,
    lastStop: makeLastStop(partial),
    destinations: needsSegment
      ? dests.map((d, i) =>
          i === dests.length - 1
            ? { ...d, transportOut: [makeSegment({ mode: "none" })] }
            : d,
        )
      : dests,
  });
}

export function updateLastStop(patch) {
  if (!state.lastStop) return;
  commit({ ...state, lastStop: { ...state.lastStop, ...patch } });
}

export function removeLastStop() {
  const dests = state.destinations;
  // Nothing leaves the last real destination once there's nothing after it.
  const next =
    dests.length > 0
      ? dests.map((d, i) =>
          i === dests.length - 1 ? { ...d, transportOut: [] } : d,
        )
      : dests;
  commit({ ...state, lastStop: null, destinations: next });
}

export function setLastStopSameAsOrigin(same) {
  if (!state.lastStop) return;
  if (same) {
    commit({ ...state, lastStop: { ...state.lastStop, sameAsOrigin: true } });
    return;
  }
  // Detach: freeze whatever the origin currently resolves to as an
  // independent, editable place rather than leaving the last stop blank.
  const resolved = effectiveLastStop(state);
  commit({
    ...state,
    lastStop: {
      ...state.lastStop,
      sameAsOrigin: false,
      name: resolved?.name ?? state.lastStop.name,
      country: resolved?.country ?? state.lastStop.country,
      lat: resolved?.lat ?? state.lastStop.lat,
      lng: resolved?.lng ?? state.lastStop.lng,
    },
  });
}

/* --- transport segments ---------------------------------------------------- */

function mapLeg(destId, fn) {
  // The origin isn't in `destinations` — route its leg mutations separately
  // so TransportLeg/SegmentRow can treat it exactly like any other stop.
  if (state.origin?.id === destId) {
    commit({
      ...state,
      origin: { ...state.origin, transportOut: fn(legOf(state.origin)) },
    });
    return;
  }
  mapDestinations((list) =>
    list.map((d) =>
      d.id === destId ? { ...d, transportOut: fn(legOf(d)) } : d,
    ),
  );
}

export function addSegment(destId, partial = {}) {
  mapLeg(destId, (segments) => [...segments, makeSegment(partial)]);
}

export function updateSegment(destId, segmentId, patch) {
  mapLeg(destId, (segments) =>
    segments.map((s) => (s.id === segmentId ? { ...s, ...patch } : s)),
  );
}

/** Patch one end of a segment; `end` is 'origin' or 'destination'. */
export function setSegmentStation(destId, segmentId, end, station) {
  mapLeg(destId, (segments) =>
    segments.map((s) =>
      s.id === segmentId
        ? { ...s, [end]: { ...emptyStation(), ...station } }
        : s,
    ),
  );
}

export function removeSegment(destId, segmentId) {
  mapLeg(destId, (segments) => segments.filter((s) => s.id !== segmentId));
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
      return segments;
    }
    const next = [...segments];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

export function addSegmentDoc(destId, segmentId, meta) {
  mapLeg(destId, (segments) =>
    segments.map((s) =>
      s.id === segmentId ? { ...s, documents: [...s.documents, meta] } : s,
    ),
  );
}

export function removeSegmentDoc(destId, segmentId, docId) {
  mapLeg(destId, (segments) =>
    segments.map((s) =>
      s.id === segmentId
        ? { ...s, documents: s.documents.filter((d) => d.id !== docId) }
        : s,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*  Destination documents (metadata only — bytes live in IndexedDB)            */
/* -------------------------------------------------------------------------- */

export function addDestDoc(destId, slot, meta) {
  mapDestinations((list) =>
    list.map((d) =>
      d.id === destId ? { ...d, [slot]: [...d[slot], meta] } : d,
    ),
  );
}

export function removeDestDoc(destId, slot, docId) {
  mapDestinations((list) =>
    list.map((d) =>
      d.id === destId
        ? { ...d, [slot]: d[slot].filter((doc) => doc.id !== docId) }
        : d,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*  Day entries: attractions + reservations                                    */
/* -------------------------------------------------------------------------- */

function mutateDay(key, fn) {
  commit({
    ...state,
    days: { ...state.days, [key]: fn(getDay(state, key)) },
  });
}

export function addAttraction(key, partial = {}) {
  const created = makeAttraction({ ...partial, legOut: null });
  mutateDay(key, (day) => {
    const next = [...day.attractions];
    // The one that used to be last now needs a leg on to the newcomer.
    if (next.length > 0) {
      const prev = next[next.length - 1];
      next[next.length - 1] = {
        ...prev,
        legOut: prev.legOut ?? { mode: "none", durationMin: 0, distanceKm: 0 },
      };
    }
    next.push(created);
    return { ...day, attractions: next };
  });
}

/**
 * Route legs describe "how you leave this stop", so they belong to the slot in
 * the day, not to the attraction being dragged. Detach, reorder, re-attach by
 * index — the same rule the destination list uses.
 */
function relinkLegs(list) {
  const legs = list.map((a) => a.legOut);
  return list.map((a, i) => ({
    ...a,
    legOut: i === list.length - 1 ? null : (legs[i] ?? null),
  }));
}

export function reorderAttraction(key, from, to) {
  mutateDay(key, (day) => {
    const list = day.attractions;
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= list.length ||
      to >= list.length
    ) {
      return day;
    }
    const next = list.map((a) => ({ ...a, legOut: null }));
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // Legs stay with the positions they described, not with the moved item.
    const legs = list.map((a) => a.legOut);
    return {
      ...day,
      attractions: next.map((a, i) => ({
        ...a,
        legOut: i === next.length - 1 ? null : (legs[i] ?? null),
      })),
    };
  });
}

export function setAttractionLeg(key, attractionId, patch) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: day.attractions.map((a) =>
      a.id === attractionId
        ? {
            ...a,
            legOut: {
              mode: "none",
              durationMin: 0,
              distanceKm: 0,
              ...a.legOut,
              ...patch,
            },
          }
        : a,
    ),
  }));
}

export function updateAttraction(key, id, patch) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: day.attractions.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    ),
  }));
}

export function removeAttraction(key, id) {
  mutateDay(key, (day) => ({
    ...day,
    attractions: relinkLegs(day.attractions.filter((a) => a.id !== id)),
  }));
}

export function addReservation(key, partial = {}) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: [...day.reservations, makeReservation(partial)],
  }));
}

export function updateReservation(key, id, patch) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === id ? { ...r, ...patch } : r,
    ),
  }));
}

export function removeReservation(key, id) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.filter((r) => r.id !== id),
  }));
}

export function addReservationDoc(key, reservationId, meta) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === reservationId ? { ...r, documents: [...r.documents, meta] } : r,
    ),
  }));
}

export function removeReservationDoc(key, reservationId, docId) {
  mutateDay(key, (day) => ({
    ...day,
    reservations: day.reservations.map((r) =>
      r.id === reservationId
        ? { ...r, documents: r.documents.filter((d) => d.id !== docId) }
        : r,
    ),
  }));
}

/* --- per-day accommodation ------------------------------------------------- */

/** Opt this night out of the destination's accommodation. */
export function addDayAccommodation(key, partial = {}) {
  mutateDay(key, (day) => ({
    ...day,
    accommodation: day.accommodation ?? makeDayAccommodation(partial),
  }));
}

export function updateDayAccommodation(key, patch) {
  mutateDay(key, (day) => ({
    ...day,
    accommodation: makeDayAccommodation({ ...day.accommodation, ...patch }),
  }));
}

/** Drop back to inheriting the destination's accommodation. */
export function removeDayAccommodation(key) {
  mutateDay(key, (day) => ({ ...day, accommodation: null }));
}

export function addDayAccommodationDoc(key, meta) {
  mutateDay(key, (day) => {
    const current = day.accommodation ?? makeDayAccommodation();
    return {
      ...day,
      accommodation: { ...current, documents: [...current.documents, meta] },
    };
  });
}

export function removeDayAccommodationDoc(key, docId) {
  mutateDay(key, (day) => {
    if (!day.accommodation) return day;
    return {
      ...day,
      accommodation: {
        ...day.accommodation,
        documents: day.accommodation.documents.filter((d) => d.id !== docId),
      },
    };
  });
}

/**
 * Every document attached to a destination, from every place one can live —
 * its own travel/sleeping docs, plus any of its nights' own accommodation or
 * reservations — for the Details tab's single combined view. `kind` tells the
 * caller which remover to call and how to label the source.
 */
export function destinationDocuments(trip, dest) {
  const items = [];
  dest.travelDocs.forEach((doc) => items.push({ doc, kind: "travel" }));
  dest.sleepingDocs.forEach((doc) => items.push({ doc, kind: "sleeping" }));
  legOf(dest).forEach((segment, i) =>
    segment.documents.forEach((doc) =>
      items.push({
        doc,
        kind: "transport",
        segmentId: segment.id,
        segmentIndex: i,
        mode: segment.mode,
      }),
    ),
  );
  for (let n = 0; n < dest.nights; n += 1) {
    const key = dayKey(dest.id, n);
    const entry = getDay(trip, key);
    entry.accommodation?.documents.forEach((doc) =>
      items.push({ doc, kind: "accommodation", key, nightIndex: n }),
    );
    entry.reservations.forEach((r) =>
      r.documents.forEach((doc) =>
        items.push({
          doc,
          kind: "reservation",
          key,
          nightIndex: n,
          reservationId: r.id,
          reservationName: r.name,
        }),
      ),
    );
  }
  return items;
}

export function resetTrip() {
  // Reset the active trip's contents in place — same id, so it stays the same
  // stored (and, once synced, the same remote) trip.
  commit(normalize({ ...seedTrip(), id: activeId }));
}

/* -------------------------------------------------------------------------- */
/*  Derived data                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Walk the itinerary from the start date, handing each stop the arrival and
 * departure dates implied by the nights before it.
 */
export function withDates(trip) {
  let cursor = parseISO(trip.startDate);
  return trip.destinations.map((d) => {
    const start = cursor;
    const end = addDays(start, d.nights);
    cursor = end;
    return { ...d, startDate: start, endDate: end };
  });
}

/** Every night of the trip, in order, with its day entry resolved. */
export function tripDays(trip, destinations = withDates(trip)) {
  const days = [];
  destinations.forEach((dest, destIndex) => {
    for (let n = 0; n < dest.nights; n += 1) {
      const key = dayKey(dest.id, n);
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
      });
    }
  });
  return days;
}

/** Only days that actually exist count — orphaned entries are excluded. */
function liveDayEntries(trip) {
  return trip.destinations.flatMap((dest) =>
    Array.from({ length: dest.nights }, (_, n) =>
      getDay(trip, dayKey(dest.id, n)),
    ),
  );
}

/**
 * What a stop costs to sleep at, night by night.
 *
 * A night with its own accommodation *replaces* the destination's nightly rate
 * rather than adding to it — you only sleep in one bed a night, so counting
 * both would inflate the budget.
 */
export function sleepingCost(trip, dest) {
  const nightly = num(dest.sleeping?.cost);
  return Array.from({ length: dest.nights }, (_, n) => {
    const override = getDay(trip, dayKey(dest.id, n)).accommodation;
    return override ? num(override.cost) : nightly;
  }).reduce((sum, cost) => sum + cost, 0);
}

export function tripStats(trip) {
  const plannedNights = trip.destinations.reduce((sum, d) => sum + d.nights, 0);
  const totalNights = Math.max(
    0,
    differenceInCalendarDays(parseISO(trip.endDate), parseISO(trip.startDate)),
  );

  const sleeping = trip.destinations.reduce(
    (sum, d) => sum + sleepingCost(trip, d),
    0,
  );
  const transport =
    trip.destinations.reduce((sum, d) => sum + legTotals(d).cost, 0) +
    (trip.origin ? legTotals(trip.origin).cost : 0);

  const entries = liveDayEntries(trip);
  const attractions = entries.reduce(
    (sum, day) => sum + day.attractions.reduce((s, a) => s + num(a.cost), 0),
    0,
  );
  const reservations = entries.reduce(
    (sum, day) => sum + day.reservations.reduce((s, r) => s + num(r.cost), 0),
    0,
  );

  const done = entries.reduce(
    (sum, day) =>
      sum +
      day.attractions.filter((a) => a.done).length +
      day.reservations.filter((r) => r.done).length,
    0,
  );
  const planned = entries.reduce(
    (sum, day) => sum + day.attractions.length + day.reservations.length,
    0,
  );

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
  };
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
  );

  return sleepingCost(trip, dest) + legTotals(dest).cost + dayCosts;
}

export function num(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export const formatDay = (date) =>
  format(date, "EEE d MMM", { locale: currentDateLocale() });
