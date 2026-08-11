/**
 * Destination lookup.
 *
 * A built-in list answers instantly and keeps the app usable offline; if the
 * query finds little locally we also ask Nominatim (OpenStreetMap's geocoder,
 * free and key-less) so any town in the world can be added.
 */

// prettier-ignore
const CITIES = [
  ['Amsterdam','Netherlands',52.3676,4.9041], ['Athens','Greece',37.9838,23.7275],
  ['Bangkok','Thailand',13.7563,100.5018], ['Barcelona','Spain',41.3874,2.1686],
  ['Berlin','Germany',52.52,13.405], ['Bogotá','Colombia',4.711,-74.0721],
  ['Budapest','Hungary',47.4979,19.0402], ['Buenos Aires','Argentina',-34.6037,-58.3816],
  ['Cairo','Egypt',30.0444,31.2357], ['Cape Town','South Africa',-33.9249,18.4241],
  ['Chiang Mai','Thailand',18.7883,98.9853], ['Copenhagen','Denmark',55.6761,12.5683],
  ['Cusco','Peru',-13.5319,-71.9675], ['Dubai','United Arab Emirates',25.2048,55.2708],
  ['Dublin','Ireland',53.3498,-6.2603], ['Edinburgh','United Kingdom',55.9533,-3.1883],
  ['Florence','Italy',43.7696,11.2558], ['Hanoi','Vietnam',21.0278,105.8342],
  ['Ho Chi Minh City','Vietnam',10.8231,106.6297], ['Hong Kong','China',22.3193,114.1694],
  ['Istanbul','Turkey',41.0082,28.9784], ['Jerusalem','Israel',31.7683,35.2137],
  ['Kraków','Poland',50.0647,19.945], ['Kuala Lumpur','Malaysia',3.139,101.6869],
  ['Kyoto','Japan',35.0116,135.7681], ['Lisbon','Portugal',38.7223,-9.1393],
  ['Ljubljana','Slovenia',46.0569,14.5058], ['London','United Kingdom',51.5072,-0.1276],
  ['Madrid','Spain',40.4168,-3.7038], ['Marrakesh','Morocco',31.6295,-7.9811],
  ['Medellín','Colombia',6.2442,-75.5812], ['Melbourne','Australia',-37.8136,144.9631],
  ['Mexico City','Mexico',19.4326,-99.1332], ['Milano','Italy',45.4642,9.19],
  ['Naples','Italy',40.8518,14.2681], ['New York','United States',40.7128,-74.006],
  ['Nice','France',43.7102,7.262], ['Osaka','Japan',34.6937,135.5023],
  ['Oslo','Norway',59.9139,10.7522], ['Pai District','Thailand',19.3583,98.4406],
  ['Paris','France',48.8566,2.3522], ['Phuket','Thailand',7.8804,98.3923],
  ['Porto','Portugal',41.1579,-8.6291], ['Prague','Czechia',50.0755,14.4378],
  ['Queenstown','New Zealand',-45.0312,168.6626], ['Reykjavík','Iceland',64.1466,-21.9426],
  ['Rio de Janeiro','Brazil',-22.9068,-43.1729], ['Rome','Italy',41.9028,12.4964],
  ['San Francisco','United States',37.7749,-122.4194], ['Santiago','Chile',-33.4489,-70.6693],
  ['Seoul','South Korea',37.5665,126.978], ['Seville','Spain',37.3891,-5.9845],
  ['Singapore','Singapore',1.3521,103.8198], ['Siem Reap','Cambodia',13.3671,103.8448],
  ['Split','Croatia',43.5081,16.4402], ['Stockholm','Sweden',59.3293,18.0686],
  ['Sydney','Australia',-33.8688,151.2093], ['Tbilisi','Georgia',41.7151,44.8271],
  ['Tel Aviv','Israel',32.0853,34.7818], ['Tokyo','Japan',35.6762,139.6503],
  ['Toronto','Canada',43.6532,-79.3832], ['Ubud','Indonesia',-8.5069,115.2625],
  ['Valencia','Spain',39.4699,-0.3763], ['Vancouver','Canada',49.2827,-123.1207],
  ['Venice','Italy',45.4408,12.3155], ['Vienna','Austria',48.2082,16.3738],
  ['Zagreb','Croatia',45.815,15.9819], ['Zürich','Switzerland',47.3769,8.5417],
].map(([name, country, lat, lng]) => ({
  id: `local:${name}`,
  name,
  country,
  lat,
  lng,
}))

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function searchLocal(query, limit = 6) {
  const q = normalize(query.trim());
  if (!q) return [];
  return CITIES.filter((c) => normalize(c.name).includes(q))
    .sort((a, b) => {
      // Prefix matches feel more relevant than matches buried mid-word.
      const aStarts = normalize(a.name).startsWith(q);
      const bStarts = normalize(b.name).startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/**
 * Search for attractions and landmarks around a destination.
 *
 * Nominatim is biased to a box around the centre and `bounded=1` keeps results
 * inside it, so "museum" returns museums in *this* city rather than the most
 * famous one on earth.
 */
export async function searchNearby(query, center, signal, limit = 8) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");

  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    const pad = 0.35; // roughly 35 km, enough for a city and its outskirts
    url.searchParams.set(
      "viewbox",
      [
        center.lng - pad,
        center.lat + pad,
        center.lng + pad,
        center.lat - pad,
      ].join(","),
    );
    url.searchParams.set("bounded", "1");
  }

  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const rows = await res.json();

  return rows.map((r) => {
    const parts = r.display_name.split(",").map((s) => s.trim());
    return {
      id: `osm:${r.osm_type}:${r.osm_id}`,
      name: r.name || parts[0],
      // A short locality hint rather than the full comma-separated address.
      address: parts.slice(1, 3).join(", "),
      category: r.type?.replace(/_/g, " ") ?? "",
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    };
  });
}

// Nominatim's `addresstype`/`type` for places worth adding as a trip stop —
// admin areas, settlements and islands, never a street, shop, bar or restaurant.
const DESTINATION_KINDS = new Set([
  "country",
  "state",
  "region",
  "province",
  "county",
  "municipality",
  "city",
  "town",
  "village",
  "hamlet",
  "island",
  "islet",
  "archipelago",
  "administrative",
]);

const isDestinationRow = (r) =>
  DESTINATION_KINDS.has(r.addresstype) || DESTINATION_KINDS.has(r.type);

export async function searchRemote(query, signal, limit = 6) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  // Over-fetch since destination-kind filtering below discards some rows.
  url.searchParams.set("limit", String(Math.max(limit * 3, 15)));
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const rows = await res.json();

  return rows
    .filter(isDestinationRow)
    .slice(0, limit)
    .map((r) => ({
      id: `osm:${r.osm_type}:${r.osm_id}`,
      name: r.name || r.display_name.split(",")[0],
      country: r.address?.country ?? "",
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
}

/**
 * Rough travel time for a hop between two attractions, in minutes.
 *
 * Speeds are deliberately conservative city averages applied to straight-line
 * distance — real streets are longer than the crow flies, so this lands in the
 * right ballpark without calling a routing service.
 */
const SPEED_KMH = {
  walk: 4.5,
  bus: 16,
  car: 22,
  train: 32,
  ferry: 20,
  plane: 500,
};

export function estimateDuration(km, mode = "walk") {
  const speed = SPEED_KMH[mode] ?? SPEED_KMH.walk;
  return Math.max(1, Math.round((km / speed) * 60));
}

/** Great-circle distance in km, unrounded. */
export function distanceKmExact(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Whole km — fine between cities, where a rounded figure is what you want. */
export function distanceKm(a, b) {
  return Math.round(distanceKmExact(a, b));
}

/**
 * Hops between attractions are usually under a kilometre, where rounding to
 * whole km would collapse everything to 0, so keep one decimal below 10 km.
 */
export function distanceShort(a, b) {
  const km = distanceKmExact(a, b);
  return km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
}
