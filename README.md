# Project Travel

A multi-stop trip planner in the spirit of Stippl: lay out destinations, dial in
how many nights you spend at each, connect them with transport legs, track the
budget, and keep every booking document attached to the stop it belongs to.

## Running it

```bash
npm run dev
```

Then open http://localhost:5173. Other scripts: `npm run build`, `npm run
preview`, `npm run lint`.

## What's in it

- **Destinations planner** — ordered stops with a nights stepper. Dates cascade
  automatically: change the nights at stop 2 and everything downstream shifts.
  The header ring tracks planned nights against the trip length.
- **Transport legs** — each stop carries the journey *out* of it as an ordered
  list of **segments**, so "bus to the airport, flight, train into town" is
  three hops rather than one lossy "plane". Every segment has a mode, an
  **origin station** and a **destination station**; duration, distance and cost
  are **optional add-ons** — a chip adds the field, an × removes it and clears
  the value, and a field with a value is always shown. Segments can be added,
  removed and dragged into order. Stations are looked up
  with the same geocoder as destinations, but they are **informative only** —
  they never move the route line. The collapsed bar shows one icon per hop plus
  the journey totals. Reordering destinations rebinds legs to itinerary
  position, so the route stays coherent.
- **Map** — Leaflet with four switchable basemaps (Streets, Minimal, Terrain,
  Satellite), no API key. Numbered pins and curved route arcs coloured by
  transport mode, each carrying a badge of its mode. Links always run
  destination to destination; a multi-hop journey splits that same line into
  one coloured piece per hop. Hovering a row highlights its pin and vice versa.
  The panel is resizable by dragging the divider.
- **Details tab** — one sub-tab per destination, each holding that stop's
  notes, travel documents and sleeping documents. Clicking a destination's
  numbered pin on the map opens that stop's Details directly.
- **Daily planner** — one card per night, each with an **Attractions** section,
  a **Reserved** section and an opt-in **Accommodation** section. A night
  normally inherits the destination's hotel; adding accommodation overrides
  just that night (for a mid-stay move) with its own cost, address and uploaded
  booking documents. The override's cost *replaces* the destination's nightly
  rate for that night rather than adding to it. Every entry takes a **time**, a cost and a completion
  checkbox; reservations also carry their own uploaded confirmation.
  Attractions come from **two search sources in one box**: typing runs a
  free-text place lookup (Nominatim, biased to a box around the destination so
  "museum" returns museums *here*), while the category chips browse **BizData**
  for businesses in that city — each result carrying phone, website and opening
  hours. Both store coordinates. Consecutive attractions are joined by a
  **route leg** — mode, distance and an estimated duration — and the map
  narrows to show that day's route while a day is open.
- **Drag to reorder** — destinations and attractions both reorder by dragging
  their grip, renumbering live. Dragging is armed by the grip rather than the
  whole row, so text selection inside the inputs keeps working.
- **Budget** — totals split by sleeping / transport / attractions / reserved,
  with a per-destination breakdown and share-of-total bars.

## Colour scheme, theming and language

Two brand colours, extended into a single ramp in `src/index.css` under
`@theme` so the whole UI stays in one hue family:

| Token       | Hex       | Used for                       |
| ----------- | --------- | ------------------------------ |
| `brand-500` | `#6260FF` | Accent, primary buttons, pins  |
| `brand-100` | `#E4E4FF` | Soft fills, active states      |

The intermediate steps (`brand-50` … `brand-950`) are interpolated between and
beyond those two.

On top of the ramp sits a set of **semantic tokens** — `canvas`, `surface`,
`raised`, `fg`, `muted`, `subtle`, `line`, `line-strong`, `accent`,
`accent-soft`, `on-accent`. Components reference only these, so the whole app
re-themes from one block of CSS rather than every file needing a `dark:` twin.
In dark mode the accent lifts to `#8A88FF` to hold contrast against a dark
surface.

**Theme** is light / dark / system, persisted under `project-travel:theme` and
applied as `data-theme` on `<html>`. System mode follows
`prefers-color-scheme` live.

**Language** is English or Hebrew (`project-travel:lang`), defaulting to the
browser's preference. Picking Hebrew sets `dir="rtl"` on `<html>` and the whole
layout mirrors — the controls, sidebar and map panel all swap sides. Strings
live in `src/lib/i18n.js`; dates use the matching `date-fns` locale and money
uses `Intl.NumberFormat` with `he-IL` / `en-GB`.

Layout uses logical properties (`ms`/`me`, `ps`/`pe`, `start`/`end`,
`border-s`) rather than left/right, which is what makes the mirroring work. The
map's resize handle measures from the opposite edge in RTL and swaps its arrow
keys, so dragging still follows the cursor.

## How data is stored

Everything is local to the browser — there is no backend.

- **Trip structure** (destinations, nights, costs, day entries, document
  *metadata*) lives in `localStorage` under `project-travel:trip:v2`.
- **Uploaded files** live in **IndexedDB** via `idb-keyval`, keyed `doc:<id>`.
  localStorage caps out near 5 MB and only holds strings; IndexedDB stores Blobs
  directly, so a passport scan or a PDF ticket fits comfortably.

Clearing site data resets the app to the seeded example trip.

### Day keys

Attractions and reservations hang off `trip.days`, keyed `<destinationId>:<nightIndex>`
rather than by calendar date. Keying by itinerary position means moving the trip's
start date carries every plan along with it. Trimming nights leaves an entry
orphaned but intact — add the night back and it returns; deleting the stop
removes its days for good.

### Migration

A `v1` payload is upgraded on first load and written straight to `v2`, leaving
`v1` in place as a fallback. The old single `documents` list becomes
`travelDocs`, and per-destination `activities` become attractions on the first
night of their stop.

Legs were once a single `{ mode, durationMin, distanceKm, cost }` object. They
are normalised into a one-segment array on load, so an existing trip keeps its
transport and simply gains the ability to add more hops. This normalisation is
in-memory and persists on the next write.

## Layout of the source

```
src/
  App.jsx                 shell, view switching, map docking
  lib/
    store.js              trip state, mutations, derived dates and totals
    docs.js               IndexedDB file storage
    places.js             built-in city list + Nominatim geocoding
    bizdata.js            BizData business search (no key, category-based)
    arc.js                curved route geometry
    useDragReorder.js     grip-armed drag-and-drop reordering
    money.js              currency and duration formatting
    theme.js              light / dark / system preference
    i18n.js               en + he strings, direction, locales
  components/
    Sidebar.jsx           icon rail
    AppControls.jsx       language picker + theme switch
    TripHeader.jsx        title, dates, currency, nights ring
    PlanView.jsx          destination list + search
    DestinationRow.jsx    one stop: nights + sleeping
    TransportLeg.jsx      multi-segment journey editor between two stops
    PlaceSearchInput.jsx  searchable station field (name + coordinates)
    DetailsView.jsx       per-destination notes and document tabs
    ItineraryView.jsx     day-by-day with attractions and reservations
    AttractionSearch.jsx  city-scoped place search
    AttractionLeg.jsx     route hop between two attractions
    DocumentsPanel.jsx    reusable upload / preview / download / delete
    TripMap.jsx           Leaflet map, basemap switcher, coloured arcs
    ResizeHandle.jsx      draggable map/content splitter
    BudgetView.jsx        cost breakdown
```

## Notes

### Search providers

Both are free and need no API key.

**[Nominatim](https://nominatim.openstreetmap.org/)** handles free text — the
only way to find a place by name. Destination search checks a built-in list of
~68 cities first so it answers instantly and works offline, then tops up from
Nominatim. Nominatim asks for no more than one request per second, so requests
are debounced and aborted when you keep typing.

**[BizData](https://bizdata-web.vercel.app/)** handles the category chips. It
is a business browser, not a text search, and its API shape constrains the UI
in two ways worth knowing:

- `location` must be a place **name**. Passing coordinates returns
  `400 Missing required parameter: location`, so the chips use the
  destination's name.
- `category` must be one of a fixed list of 37. The ten most travel-relevant
  are exposed as chips.

Cold responses take a few seconds and warm ones ~100ms, so BizData never blocks
the box: typing stays responsive and business results append when they arrive.
Results are cached per location + category.
