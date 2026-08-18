/**
 * Renders a static snapshot of the trip map for the PDF export: CARTO Voyager
 * basemap tiles (the app's default light basemap, legible on white paper), the
 * colour-per-segment route arcs, and numbered destination pins. It mirrors
 * TripMap's whole-trip view — origin/last stop are shown only when opted in and
 * placed — so the printout matches what the user sees on screen.
 *
 * Everything is best-effort: if tiles can't be fetched (offline) the route and
 * pins still draw over a plain background, and any hard failure returns null so
 * the caller can simply omit the map rather than break the export.
 */
import { arcPoints, splitArc } from "./arc.js";
import { effectiveLastStop, isPlaced, legOf, modeColor } from "./store.js";

const TILE = 256;
const TILE_URL = "https://a.basemaps.cartocdn.com/rastertiles/voyager";
const PAD = 72; // px kept clear around the route so pins/labels aren't clipped
const MAX_W = 1200;
const MAX_H = 780;
const MIN_W = 420;
const MIN_H = 300;

const worldSize = (zoom) => TILE * 2 ** zoom;
const lngToWorldX = (lng, scale) => ((lng + 180) / 360) * scale;
function latToWorldY(lat, scale) {
  const s = Math.min(
    Math.max(Math.sin((lat * Math.PI) / 180), -0.9999),
    0.9999,
  );
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}

function loadTile(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** origin (opt-in) + placed destinations, in order, + last stop (opt-in). */
function collectStops(trip, destinations) {
  const stops = [];
  if (trip.origin?.showOnMap && isPlaced(trip.origin)) {
    stops.push({ point: trip.origin, kind: "origin", label: null });
  }
  let n = 0;
  for (const d of destinations) {
    if (!isPlaced(d)) continue;
    n += 1;
    stops.push({ point: d, kind: "dest", label: String(n) });
  }
  const last = effectiveLastStop(trip);
  if (trip.lastStop?.showOnMap && last && isPlaced(last)) {
    stops.push({ point: last, kind: "last", label: null });
  }
  return stops;
}

/** Coloured arc pieces between consecutive stops, mirroring TripMap's legs. */
function buildLegs(stops) {
  const legs = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i].point;
    const to = stops[i + 1].point;
    const a = [from.lat, from.lng];
    const b = [to.lat, to.lng];
    const segments = legOf(from);
    if (segments.length === 0) {
      legs.push({
        points: arcPoints(a, b),
        color: modeColor("train"),
        mode: null,
      });
      continue;
    }
    const whole = arcPoints(a, b, {
      segments: Math.max(96, segments.length * 48),
    });
    const pieces = splitArc(whole, segments.length);
    segments.forEach((seg, s) => {
      legs.push({
        points: pieces[s],
        color: modeColor(seg.mode),
        mode: seg.mode,
      });
    });
  }
  return legs;
}

export async function renderTripMapImage(trip, destinations) {
  const stops = collectStops(trip, destinations);
  if (stops.length === 0) return null;

  const legs = buildLegs(stops);

  // Bounds cover the arcs too (they bow outside the straight chords), so the
  // whole route stays inside the frame.
  const coords = [
    ...stops.map((s) => [s.point.lat, s.point.lng]),
    ...legs.flatMap((l) => l.points),
  ];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of coords) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  // Largest zoom at which the whole route fits the frame; a single point can't
  // set a scale, so it's capped to a sensible city-level zoom.
  const distinct = new Set(stops.map((s) => `${s.point.lat},${s.point.lng}`))
    .size;
  let zoom = 3;
  for (let z = 16; z >= 2; z -= 1) {
    const scale = worldSize(z);
    const w = Math.abs(lngToWorldX(maxLng, scale) - lngToWorldX(minLng, scale));
    const h = Math.abs(latToWorldY(maxLat, scale) - latToWorldY(minLat, scale));
    if (w <= MAX_W - PAD * 2 && h <= MAX_H - PAD * 2) {
      zoom = z;
      break;
    }
  }
  if (distinct < 2) zoom = Math.min(zoom, 11);

  const scale = worldSize(zoom);
  const project = (lat, lng) => [
    lngToWorldX(lng, scale),
    latToWorldY(lat, scale),
  ];

  const [minX, maxY] = [lngToWorldX(minLng, scale), latToWorldY(minLat, scale)];
  const [maxX, minY] = [lngToWorldX(maxLng, scale), latToWorldY(maxLat, scale)];
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // The canvas is sized to the route's own aspect (clamped) so there's minimal
  // empty margin — the snapshot "fits" the trip rather than a fixed rectangle.
  const canvasW = Math.round(
    Math.min(MAX_W, Math.max(MIN_W, maxX - minX + PAD * 2)),
  );
  const canvasH = Math.round(
    Math.min(MAX_H, Math.max(MIN_H, maxY - minY + PAD * 2)),
  );

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  // Plain water-toned background shows through any tiles that fail to load.
  ctx.fillStyle = "#dfe7ef";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const originPxX = centerX - canvasW / 2;
  const originPxY = centerY - canvasH / 2;
  const toCanvas = (lat, lng) => {
    const [wx, wy] = project(lat, lng);
    return [wx - originPxX, wy - originPxY];
  };

  // --- Tiles ---------------------------------------------------------------
  const tiles = 2 ** zoom;
  const txMin = Math.floor(originPxX / TILE);
  const txMax = Math.floor((originPxX + canvasW) / TILE);
  const tyMin = Math.floor(originPxY / TILE);
  const tyMax = Math.floor((originPxY + canvasH) / TILE);
  const jobs = [];
  for (let tx = txMin; tx <= txMax; tx += 1) {
    for (let ty = tyMin; ty <= tyMax; ty += 1) {
      if (ty < 0 || ty >= tiles) continue;
      const wx = ((tx % tiles) + tiles) % tiles;
      const dx = tx * TILE - originPxX;
      const dy = ty * TILE - originPxY;
      jobs.push(
        loadTile(`${TILE_URL}/${zoom}/${wx}/${ty}@2x.png`).then((img) => {
          if (img) ctx.drawImage(img, dx, dy, TILE, TILE);
        }),
      );
    }
  }
  await Promise.all(jobs);

  // --- Route arcs ----------------------------------------------------------
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const leg of legs) {
    if (leg.points.length < 2) continue;
    ctx.beginPath();
    leg.points.forEach(([lat, lng], i) => {
      const [x, y] = toCanvas(lat, lng);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // White halo under the colour keeps the line legible over busy tiles.
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = leg.color;
    ctx.lineWidth = 4.5;
    ctx.stroke();
  }

  // --- Pins ----------------------------------------------------------------
  const PIN = { origin: "#57A773", dest: "#6B6A99", last: "#C5573A" };
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const stop of stops) {
    const [x, y] = toCanvas(stop.point.lat, stop.point.lng);
    const r = stop.kind === "dest" ? 13 : 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = PIN[stop.kind];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    if (stop.label) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px Arial, sans-serif";
      ctx.fillText(stop.label, x, y + 0.5);
    }
  }

  // --- Attribution (required by the tile provider) -------------------------
  const credit = "© OpenStreetMap · © CARTO";
  ctx.font = "11px Arial, sans-serif";
  const tw = ctx.measureText(credit).width;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(canvasW - tw - 12, canvasH - 20, tw + 12, 20);
  ctx.fillStyle = "#4a4a55";
  ctx.textAlign = "right";
  ctx.fillText(credit, canvasW - 6, canvasH - 10);

  // Unique modes actually used, in route order, so the caller can draw a legend.
  const modes = [];
  for (const leg of legs) {
    if (leg.mode && !modes.includes(leg.mode)) modes.push(leg.mode);
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvasW,
    height: canvasH,
    modes,
  };
}
