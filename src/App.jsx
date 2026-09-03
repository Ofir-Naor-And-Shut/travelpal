import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Map as MapIcon } from "lucide-react";
import TabNav from "./components/TabNav.jsx";
import TripHeader from "./components/TripHeader.jsx";
import PlanView from "./components/PlanView.jsx";
import ItineraryView from "./components/ItineraryView.jsx";
import BudgetView from "./components/BudgetView.jsx";
import DetailsView from "./components/DetailsView.jsx";
import TripMap from "./components/TripMap.jsx";
import ResizeHandle from "./components/ResizeHandle.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import TripPicker from "./components/TripPicker.jsx";
import SharedTripView from "./components/SharedTripView.jsx";
import PhotoLightbox from "./components/PhotoLightbox.jsx";
import {
  effectiveLastStop,
  getTripRegistry,
  isPlaced,
  switchTrip,
  tripDays,
  tripStats,
  useCloudMode,
  useTrip,
  useTripsReady,
  withDates,
} from "./lib/store.js";
import { useLocalOnly, useSession } from "./lib/auth.js";
import {
  clearRouteTrip,
  setRouteTrip,
  useRouteTripId,
  useShareToken,
} from "./lib/router.js";
import { hasSupabase } from "./lib/supabase.js";
import { useOnline } from "./lib/network.js";
import { useI18n } from "./lib/i18n.js";

// The map only earns its space where the route is the subject.
const MAP_VIEWS = new Set(["plan", "view"]);

const MAP_WIDTH_KEY = "project-travel:map-width";
const DEFAULT_MAP_PCT = 42;
const MIN_MAP_PX = 300;
const MIN_CONTENT_PX = 420;

/**
 * Screen gate. Four states, in order:
 *   1. Supabase configured but not signed in (and not opted into local-only)
 *      → the auth screen.
 *   2. Signed in (or local-only, or no Supabase at all) but the real trip
 *      data hasn't loaded yet → the loading splash. Without this, the
 *      picker/editor would briefly show the in-memory placeholder trip
 *      (store.js's demo seed) while the cloud fetch is still in flight.
 *   3. Real data loaded, but no trip opened yet → the trip picker.
 *   4. A trip opened → the editor.
 *
 * All hooks run before any branch, so the rules of hooks hold; the heavy
 * editor and its map only mount once a trip is actually open.
 */
// Everything renders inside this; the lightbox sits alongside so a picture
// preview can open from any screen.
export default function App() {
  return (
    <>
      <AppScreens />
      <PhotoLightbox />
    </>
  );
}

function AppScreens() {
  const { session, ready } = useSession();
  const localOnly = useLocalOnly();
  const tripsReady = useTripsReady();
  const routeTripId = useRouteTripId();
  const shareToken = useShareToken();
  const [inEditor, setInEditor] = useState(false);
  const hadSessionRef = useRef(Boolean(session));

  // Signing out (session gone) drops back to the gate, so a later sign-in lands
  // on the picker rather than jumping straight into the last-open editor. Only
  // reacts to an actual sign-out transition — `session` is also null on every
  // mount for local-only/not-yet-signed-in users, and that must not clobber
  // the route resolved below.
  useEffect(() => {
    const wasSignedIn = hadSessionRef.current;
    hadSessionRef.current = Boolean(session);
    if (wasSignedIn && !session) {
      setInEditor(false);
      clearRouteTrip();
    }
  }, [session]);

  // The URL is the source of truth for which screen to show: reopen the trip
  // named in the hash once real trip data is available (a refresh, or a
  // shared/bookmarked link), follow the browser's back/forward buttons, and
  // fall back to the picker if that trip no longer exists. Runs as a layout
  // effect so a trip reopened this way never flashes the picker first.
  useLayoutEffect(() => {
    if (!tripsReady) return;
    const exists =
      routeTripId && getTripRegistry().trips.some((t) => t.id === routeTripId);
    if (exists) {
      switchTrip(routeTripId);
      setInEditor(true);
    } else {
      if (routeTripId) clearRouteTrip();
      setInEditor(false);
    }
  }, [tripsReady, routeTripId]);

  // A shared view-only link is public: no auth, no picker, not even the
  // splash gate below — it never touches the signed-in trip store at all.
  if (shareToken) return <SharedTripView token={shareToken} />;

  const showSplash =
    hasSupabase && (!ready || ((session || localOnly) && !tripsReady));

  // Wait for the initial session check, and then for the real trip data, so
  // we don't flash the sign-in screen or the placeholder demo trip.
  if (showSplash) {
    return (
      <div className="grid min-h-full place-items-center bg-canvas">
        <span className="animate-pulse text-3xl" aria-hidden>
          🌍
        </span>
      </div>
    );
  }

  if (hasSupabase && !session && !localOnly) return <AuthScreen />;

  if (!inEditor) {
    return (
      <TripPicker
        onSelect={(id) => {
          switchTrip(id);
          setInEditor(true);
        }}
      />
    );
  }

  return (
    <TripEditor
      onBackToTrips={() => {
        clearRouteTrip();
        setInEditor(false);
      }}
    />
  );
}

function TripEditor({ onBackToTrips }) {
  const trip = useTrip();
  const { t, rtl } = useI18n();
  const cloudMode = useCloudMode();
  const online = useOnline();
  const readOnly = cloudMode && !online;
  const [view, setView] = useState("plan");

  // Keep the URL pointed at whichever trip is actually active, so switching
  // trips from the in-editor switcher (not just the picker) still leaves a
  // refreshable/shareable link behind.
  useEffect(() => {
    setRouteTrip(trip.id);
  }, [trip.id]);

  const [activeId, setActiveId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  // Set when a destination is double-clicked; cleared once the day scrolls in.
  const [focusDestId, setFocusDestId] = useState(null);
  const [openDayKey, setOpenDayKey] = useState(null);

  const openDayFor = useCallback((destId) => {
    setFocusDestId(destId);
    setView("view");
  }, []);

  const clearFocus = useCallback(() => setFocusDestId(null), []);

  // Clicking a destination pin on the map jumps to that stop's Details tab.
  const [detailsDestId, setDetailsDestId] = useState(null);

  const openDetailsFor = useCallback((destId) => {
    setDetailsDestId(destId);
    setView("details");
  }, []);

  const clearDetailsFocus = useCallback(() => setDetailsDestId(null), []);

  // Only the day that is actually open drives the map; collapsing the current
  // one (or switching to another) releases it rather than leaving the map
  // stuck on a hidden day. ItineraryView enforces that at most one day is
  // open at a time and reports the current key (or null) here.
  const handleDayFocus = useCallback((key) => {
    setOpenDayKey(key);
  }, []);

  const splitRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [mapPct, setMapPct] = useState(() => {
    const saved = Number(localStorage.getItem(MAP_WIDTH_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_MAP_PCT;
  });

  /**
   * Keep both panes usable: the map never shrinks below MIN_MAP_PX and never
   * squeezes the itinerary under MIN_CONTENT_PX. Falls back to a plain
   * percentage clamp on containers too narrow to satisfy both.
   */
  const clampPct = useCallback((pct) => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0;
    if (width === 0) return Math.min(Math.max(pct, 20), 75);

    const maxPx = Math.max(MIN_MAP_PX, width - MIN_CONTENT_PX);
    const px = Math.min(Math.max((pct / 100) * width, MIN_MAP_PX), maxPx);
    return (px / width) * 100;
  }, []);

  /**
   * Mirrors the width in a ref, updated synchronously by every resize. Keeping
   * the callbacks stable stops the drag listeners being re-attached on each
   * pointermove — and, because a keyboard resize commits in the same tick it
   * resizes, the ref must lead the state rather than follow it on re-render.
   */
  const mapPctRef = useRef(mapPct);

  /**
   * The width the user actually asked for, before clamping. Kept separate so a
   * value that doesn't fit the current window is only narrowed for display —
   * widen the window again and their preference comes back rather than being
   * permanently trimmed.
   */
  const preferredPctRef = useRef(mapPct);

  const resizeMap = useCallback(
    (pct) => {
      preferredPctRef.current = pct;
      const next = clampPct(pct);
      mapPctRef.current = next;
      setMapPct(next);
    },
    [clampPct],
  );

  /**
   * Re-clamp on mount and whenever the window changes size.
   *
   * Clamping only inside the drag handler left two ways for the itinerary to
   * collapse: a width restored from a previous, wider window, and shrinking the
   * window after dragging the map out. Either could squeeze the content pane to
   * a few pixels and hide the destination names entirely.
   *
   * This runs in a layout effect so a stale stored width is corrected before
   * the first paint rather than flashing a collapsed pane.
   */
  useLayoutEffect(() => {
    const apply = () => {
      const next = clampPct(preferredPctRef.current);
      mapPctRef.current = next;
      setMapPct((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [clampPct]);

  const commitMapWidth = useCallback(() => {
    try {
      localStorage.setItem(MAP_WIDTH_KEY, String(mapPctRef.current));
    } catch {
      // Non-fatal: the width just won't survive a reload.
    }
  }, []);

  const resetMapWidth = useCallback(() => {
    preferredPctRef.current = DEFAULT_MAP_PCT;
    mapPctRef.current = DEFAULT_MAP_PCT;
    setMapPct(DEFAULT_MAP_PCT);
    commitMapWidth();
  }, [commitMapWidth]);

  const destinations = useMemo(() => withDates(trip), [trip]);
  const days = useMemo(
    () => tripDays(trip, destinations),
    [trip, destinations],
  );
  const stats = useMemo(() => tripStats(trip), [trip]);
  const showMap = MAP_VIEWS.has(view);

  /**
   * In Day by day the map follows whichever day is open, showing that day's
   * attraction route instead of the whole-trip route.
   *
   * It engages as soon as a day opens — before any attraction exists — so the
   * city is already framed while you search for the first one, rather than the
   * view jumping continents once a pin finally lands.
   */
  const dayRoute = useMemo(() => {
    if (view !== "view" || !openDayKey) return null;
    const day = days.find((d) => d.key === openDayKey);
    if (!day) return null;

    const stops = day.entry.attractions.filter(isPlaced);
    const center = isPlaced(day.dest)
      ? { lat: day.dest.lat, lng: day.dest.lng }
      : null;

    // Nothing to frame at all — fall back to the whole-trip view.
    if (!center && stops.length === 0) return null;
    return { label: day.dest.name, stops, center };
  }, [view, openDayKey, days]);

  return (
    <div className="flex h-full flex-col">
      {readOnly && (
        <p className="shrink-0 bg-accent-soft px-4 py-2 text-center text-xs font-medium text-fg">
          {t("offline.banner")}
        </p>
      )}
      <div
        ref={splitRef}
        className={`relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row ${
          dragging ? "cursor-col-resize select-none" : ""
        } ${readOnly ? "pointer-events-none select-none opacity-90" : ""}`}
      >
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          <TripHeader trip={trip} stats={stats} onBackToTrips={onBackToTrips} />

          {!mapOpen && <TabNav active={view} onChange={setView} />}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "plan" && (
              <PlanView
                trip={trip}
                destinations={destinations}
                activeId={activeId}
                onHover={setActiveId}
                onOpenDay={openDayFor}
              />
            )}
            {view === "details" && (
              <DetailsView
                destinations={destinations}
                focusDestId={detailsDestId}
                onFocusHandled={clearDetailsFocus}
              />
            )}
            {view === "view" && (
              <ItineraryView
                days={days}
                currency={trip.currency}
                focusDestId={focusDestId}
                onFocusHandled={clearFocus}
                onDayFocus={handleDayFocus}
              />
            )}
            {view === "budget" && (
              <BudgetView
                trip={trip}
                destinations={destinations}
                stats={stats}
              />
            )}
            {view === "discover" && <Placeholder />}
          </div>
        </main>

        {showMap && (
          <ResizeHandle
            widthPct={mapPct}
            onResize={resizeMap}
            onCommit={commitMapWidth}
            onReset={resetMapWidth}
            containerRef={splitRef}
            dragging={dragging}
            setDragging={setDragging}
            rtl={rtl}
          />
        )}

        {/* Map: a docked, resizable panel on wide screens; an overlay below lg,
            where `fixed inset-0` supplies the size instead. */}
        {showMap && (
          <aside
            style={{ "--map-w": `${mapPct}%` }}
            className={`shrink-0 border-line lg:block lg:w-[var(--map-w)] lg:border-s ${
              mapOpen ? "fixed inset-0 z-[900] block bg-surface" : "hidden"
            }`}
          >
            <TripMap
              destinations={destinations}
              origin={trip.origin}
              lastStop={effectiveLastStop(trip)}
              activeId={activeId}
              onHover={setActiveId}
              dayRoute={dayRoute}
              onOpenDetails={openDetailsFor}
              onClose={mapOpen ? () => setMapOpen(false) : undefined}
            />
          </aside>
        )}

        {showMap && !mapOpen && (
          <button
            type="button"
            className="btn-primary absolute bottom-4 end-4 z-[800] shadow-lg lg:hidden"
            onClick={() => setMapOpen(true)}
          >
            <MapIcon size={16} /> {t("map.label")}
          </button>
        )}
      </div>
    </div>
  );
}

function Placeholder() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md px-8 py-20 text-center">
      <h2 className="text-lg font-semibold">{t("nav.discover")}</h2>
      <p className="mt-1 text-sm text-muted">{t("discover.body")}</p>
      <p className="mt-4 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-fg">
        {t("misc.comingNext")}
      </p>
    </div>
  );
}
