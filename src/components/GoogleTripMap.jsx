import { useEffect, useMemo, useRef } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import { arcPoints, splitArc } from "../lib/arc.js";
import { TransportIcon } from "./TransportLeg.jsx";
import { formatDay, isPlaced, legOf, modeColor } from "../lib/store.js";
import { googleMapsKey } from "../lib/googlePlaces.js";
import { useI18n } from "../lib/i18n.js";
import { useTheme } from "../lib/theme.js";

// A minimal dark styling so the "Google" basemap choice still respects the
// app's theme rather than always rendering Google's default light roadmap.
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8aa3" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a2a45" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0d0c1a" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

/**
 * One imperative `google.maps.Polyline` per leg.
 *
 * `@vis.gl/react-google-maps` has no declarative `<Polyline>` — this mirrors
 * the library's own recommended pattern of driving the raw Maps JS object
 * from a `useMap()` handle.
 */
function GooglePolyline({ path, color, casing }) {
  const map = useMap();
  const lineRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google) return undefined;

    const line = new window.google.maps.Polyline({
      path: path.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: color,
      strokeOpacity: casing ? 0.85 : 0.95,
      strokeWeight: casing ? 8 : 4,
      zIndex: casing ? 1 : 2,
      map,
    });
    lineRef.current = line;

    return () => line.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, color, casing, JSON.stringify(path)]);

  return null;
}

function ModeBadge({ position, mode, color }) {
  return (
    <AdvancedMarker
      position={{ lat: position[0], lng: position[1] }}
      zIndex={1}
    >
      <div className="leg-badge" style={{ color, width: 22, height: 22 }}>
        <TransportIcon mode={mode} size={12} strokeWidth={2.4} />
      </div>
    </AdvancedMarker>
  );
}

function StopPin({
  stop,
  index,
  active,
  onHover,
  onOpenDetails,
  inDayMode,
  t,
}) {
  return (
    <AdvancedMarker
      position={{ lat: stop.lat, lng: stop.lng }}
      onClick={() => {
        if (!inDayMode) onOpenDetails?.(stop.id);
      }}
      onMouseEnter={() => onHover?.(stop.id)}
      onMouseLeave={() => onHover?.(null)}
      title={
        inDayMode
          ? stop.name || t("attractions.fallback")
          : `${stop.name} — ${formatDay(stop.startDate)} – ${formatDay(stop.endDate)}`
      }
    >
      <div
        className={`pin ${inDayMode ? "pin-sm" : ""} ${active ? "pin-active" : ""}`}
      >
        {index + 1}
      </div>
    </AdvancedMarker>
  );
}

/**
 * Google Maps rendering of the same trip geometry `TripMap` draws with
 * Leaflet. Feature parity is close but not exact — Google's own attribution
 * and controls replace the custom basemap/legend chrome for this surface,
 * and popups on hover are swapped for a plain marker title/tooltip since
 * `AdvancedMarker` has no built-in hover popup.
 */
export default function GoogleTripMap({
  destinations,
  activeId,
  onHover,
  dayRoute,
  onOpenDetails,
}) {
  const { t } = useI18n();
  const { theme } = useTheme();

  const inDayMode = Boolean(dayRoute);
  const stops = useMemo(
    () => (inDayMode ? dayRoute.stops : destinations.filter(isPlaced)),
    [inDayMode, dayRoute, destinations],
  );

  // A stable primitive key so the geometry only rebuilds when the route
  // itself changes, not on every unrelated render.
  const routeKey = stops
    .map((s) => `${s.id}:${s.lat},${s.lng}:${s.legOut?.mode ?? ""}`)
    .join("|");

  const legs = useMemo(() => {
    const out = [];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const from = stops[i];
      const to = stops[i + 1];
      const a = [from.lat, from.lng];
      const b = [to.lat, to.lng];
      const curvature = inDayMode ? 0.08 : 0.18;
      const segments = inDayMode
        ? [{ id: "day", mode: from.legOut?.mode ?? "walk" }]
        : legOf(from);

      if (segments.length === 0) {
        const points = arcPoints(a, b, { curvature });
        out.push({
          id: `${from.id}->${to.id}`,
          mode: "train",
          color: modeColor("train"),
          points,
          midpoint: points[Math.floor(points.length / 2)],
        });
        continue;
      }

      const wholeArc = arcPoints(a, b, {
        curvature,
        segments: Math.max(96, segments.length * 48),
      });
      const pieces = splitArc(wholeArc, segments.length);

      segments.forEach((segment, s) => {
        const points = pieces[s];
        out.push({
          id: `${from.id}->${to.id}#${segment.id}`,
          mode: segment.mode,
          color: modeColor(segment.mode),
          points,
          midpoint: points[Math.floor(points.length / 2)],
        });
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inDayMode, routeKey]);

  const center = stops.length
    ? { lat: stops[0].lat, lng: stops[0].lng }
    : { lat: 45.4642, lng: 9.19 };

  return (
    <APIProvider apiKey={googleMapsKey()} libraries={["marker"]}>
      <Map
        mapId="project-travel-trip"
        defaultCenter={center}
        defaultZoom={inDayMode ? 13 : 5}
        gestureHandling="greedy"
        disableDefaultUI={false}
        styles={theme === "dark" ? DARK_STYLE : undefined}
        className="h-full w-full"
      >
        {legs.map((leg) => (
          <GooglePolyline
            key={`casing-${leg.id}`}
            path={leg.points}
            color="#ffffff"
            casing
          />
        ))}
        {legs.map((leg) => (
          <GooglePolyline key={leg.id} path={leg.points} color={leg.color} />
        ))}
        {legs.map((leg) => (
          <ModeBadge
            key={`badge-${leg.id}`}
            position={leg.midpoint}
            mode={leg.mode}
            color={leg.color}
          />
        ))}
        {stops.map((stop, i) => {
          const index = inDayMode
            ? i
            : destinations.findIndex((d) => d.id === stop.id);
          return (
            <StopPin
              key={stop.id}
              stop={stop}
              index={index}
              active={activeId === stop.id}
              onHover={onHover}
              onOpenDetails={onOpenDetails}
              inDayMode={inDayMode}
              t={t}
            />
          );
        })}
      </Map>
    </APIProvider>
  );
}
