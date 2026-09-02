# TravelPal — Operations, Architecture & Go-to-Business Guide

> A single reference for **everything the app depends on**, **how it all fits
> together**, and **exactly what to do to run this as a real business**. Written
> to be read years from now by someone (maybe you) who has forgotten the
> details. Nothing here assumes you are a professional developer.

---

## 1. What TravelPal is, in one paragraph

TravelPal is a **local-first, bilingual (English/Hebrew, full right-to-left)
trip planner**. It is a single-page web app: everything a trip contains lives in
the visitor's own browser, works offline, and is private by default. If the
visitor signs in, their trips are also stored in the cloud (Supabase) so they
sync across devices and can be shared. There is **no traditional server we
write or run** — the app is static files plus a managed backend. That is the
single most important fact for keeping costs and maintenance low.

---

## 2. The mental model — "local-first with an optional cloud backup"

Two modes the app switches between automatically, based on whether someone is
signed in:

- **Local-only mode** — no account (or the user explicitly chose "continue
  without an account"). 100% of data lives in the browser. This is exactly how
  the app worked before any backend existed. Nothing leaves the device.
- **Cloud mode** — signed in. The cloud database (`public.trips`) becomes the
  **single source of truth**; the app does _not_ also write these trips to
  localStorage. Edits are pushed to the cloud (debounced ~1.5s). On another
  device, signing in pulls the same trips back.

The working copy the UI reads is always an in-memory store
([src/lib/store.js](src/lib/store.js)). The cloud is a durable, syncable
**backup and sync layer underneath it — not a replacement**. This is a
deliberate design choice: the app stays instant and offline-capable, and the
network is never on the critical path for the app to feel responsive.

---

## 3. Every service and dependency, and what each is for

### 3.1 Services that cost money / need an account

| Service                                                                       | Role                                                                                                                                                                         | Needed to run?                                                    | Cost model                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Supabase**                                                                  | The entire backend: user accounts (auth), the trips database (Postgres), file storage (booking PDFs / passport scans), and one serverless function that sends invite emails. | Only for accounts, sync & sharing. The app runs fully without it. | Free tier is generous; paid tier ~US$25/mo when you outgrow it (see §10). |
| **A static web host** (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.) | Serves the built app (plain HTML/CSS/JS) to visitors.                                                                                                                        | Yes, to put it on the internet.                                   | Free tiers are enough to start.                                           |
| **A domain name** (e.g. `travelpal.com`)                                      | Your address.                                                                                                                                                                | Recommended for a business.                                       | ~US$10–15/year.                                                           |
| **Google Maps Platform** _(optional)_                                         | Nicer place search + a Google-rendered map, if you set an API key. Without it, the app uses free OpenStreetMap search and a Leaflet map instead.                             | No — optional upgrade.                                            | Pay-as-you-go with a monthly free credit; **requires a billing card**.    |

### 3.2 Free, key-less services the app calls directly from the browser

These need **no account, no key, no billing**. They can also change or disappear
independently of us — the app degrades gracefully if they do.

| Service                                    | Role                                                                                              | Notes / risks                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nominatim** (OpenStreetMap geocoder)     | Free-text place & station search ("find _Wat Phra Singh_").                                       | Public usage policy asks for **≤1 request/second**; the app debounces and aborts stale requests to respect that. Heavy commercial use may need self-hosting or a paid geocoder later.                                                                          |
| **BizData** (`bizdata-web.vercel.app`)     | Category browsing of businesses (museums, hotels, restaurants…) with phone/website/opening-hours. | A third-party hobby-scale API. First lookup for a place is slow (6–12s), then cached. If it ever goes away, only the category chips break; free-text search still works. **A commercial product should not depend on it long-term** — treat as a nice-to-have. |
| **OpenStreetMap / basemap tile providers** | The four map backgrounds (Streets, Minimal, Terrain, Satellite) in the Leaflet map.               | Free public tile servers have usage policies; very high traffic may require a paid tile provider (e.g. MapTiler, Mapbox) or self-hosting.                                                                                                                      |

### 3.3 Libraries bundled into the app (no runtime service)

React + Vite (build), Tailwind v4 (styling), Leaflet + react-leaflet (map),
`@vis.gl/react-google-maps` (optional Google map), `idb-keyval` (IndexedDB file
storage), `jspdf` + `jspdf-autotable` (one-click PDF export, with an embedded
Noto Sans Hebrew font for RTL), `date-fns` (dates), `framer-motion`
(animation), `lucide-react` (icons), `@supabase/supabase-js` (backend client).

---

## 4. How data is stored (four distinct places)

1. **In-memory store** — [src/lib/store.js](src/lib/store.js). The live working
   copy every screen reads via `useTrip`. Holds several trips; the "active" one
   is what the UI shows.
2. **localStorage** (browser) — trip _structure_ only, when in local-only mode.
   One key per trip: `project-travel:trip:<id>`, plus a small index
   `project-travel:index` (`{ activeId, ids }`). Old single-trip keys
   (`:v2`/`:v1`) are migrated on first load and left as a fallback. Also stores
   preferences: `project-travel:theme`, `project-travel:lang`,
   `project-travel:local-only`.
3. **IndexedDB** (browser) — uploaded **files** (passport scans, booking PDFs)
   as Blobs, keyed `doc:<id>` via `idb-keyval`. Files never go in localStorage
   (5 MB string cap) and **never go in the Postgres database**.
4. **Supabase** (cloud, signed-in only):
   - **Postgres** `public.trips` — one row per trip, the whole trip as one JSONB
     document. Row key = the trip's UUID; `data.updatedAt` inside the JSON is the
     last-write-wins clock.
   - **Storage** bucket `trip-documents` (private) — the uploaded files, mirrored
     from IndexedDB so they sync across devices. Path
     `{uploaderId}/{tripId}/{docId}`.

**Key principle: guard the user's data like it's real, because it is.** The
cloud "adopt local trips on sign-in" flow only deletes a local copy _after_ the
cloud confirms it stored the trip — a failed push keeps the local copy as a
fallback, never a silent loss. This is regression-tested in
[test/store.sync.test.js](test/store.sync.test.js) (`npm test`).

---

## 5. Authentication — how sign-in works

Three ways in, all handled in [src/lib/auth.js](src/lib/auth.js):

- **Magic link (passwordless)** — the normal path for everyone. The user types
  their email, Supabase emails them a link, clicking it signs them in. First time
  for an email, this also _creates_ the account. No passwords stored anywhere.
- **Local-only** — a "continue without an account" choice. Persisted so it
  survives reloads. Signing in later supersedes it and adopts any local trips.
- **Admin password sign-in** — one designated admin account signs in with a real
  Supabase password (no email round-trip). Regular accounts have no password set,
  so the password form simply fails for them (natural gating). The admin account
  is created **once, by hand, in the Supabase dashboard** — no password ever
  lives in this repo or in the shipped JavaScript.

Admin _authorization_ is a `role: admin` claim in Supabase `app_metadata`, which
can only be set by a service-role request — a user can never grant it to
themselves. So the app can trust it. (Note: an admin _UI_ to browse everyone's
trips is **not built yet**; today an admin only sees their own trips. The
database permission exists as a foundation.)

The screen flow, gated in [src/App.jsx](src/App.jsx):
`AuthScreen` → `TripPicker` (landing) → `TripEditor`.

---

## 6. The database & all security policies (RLS), explained plainly

Everything is defined in [supabase/schema.sql](supabase/schema.sql), which is
**idempotent** — safe to run repeatedly in the Supabase SQL editor. Security is
enforced by **Row-Level Security (RLS)**: rules attached to each table that
decide, per row, who may read/write. This is what makes it safe to ship the
app's (public) key in the browser — the key can't bypass these rules.

### 6.1 `public.trips` — the trips themselves

- One JSONB row per trip, owned by `owner_id`.
- A signed-in user can **read/write only their own trips**. Anonymous requests
  are refused at the privilege level (`anon` is granted nothing).
- Two safety triggers: `touch_updated_at` (keeps the timestamp honest) and
  `protect_trip_owner` (a trip's owner can never be reassigned by an update —
  defense in depth against an owner-hijack bug).

### 6.2 Sharing — two independent mechanisms

- **Editor collaborators** (`trip_members` + `pending_trip_invites`): the owner
  invites someone **by email** to _edit_ the trip. If that email already has an
  account, they become a member immediately; if not, the invite waits and
  resolves itself automatically the moment that email signs up (a database
  trigger — the app never polls). A collaborator can edit content but can **never
  delete the trip or manage its sharing** — that stays owner-only. Invites start
  as `pending` and become `accepted`.
- **View-only share links** (`trip_share_links`): a token anyone can open with no
  account, read-only, via the `get_trip_by_share_token` RPC.

The cross-table checks between `trips` and `trip_members` are wrapped in
`SECURITY DEFINER` functions (`is_trip_owner`, `is_trip_editor`,
`is_trip_member`) specifically to avoid **infinite-recursion errors** in
Postgres RLS (a known trap — see the comments in the schema).

### 6.3 Invite emails — the one serverless function

[supabase/functions/send-trip-invite/index.ts](supabase/functions/send-trip-invite/index.ts)
sends the "someone shared a trip with you" email using **Supabase's own built-in
invite email** — no external email provider or API key needed. It verifies the
caller's own login, confirms they own the trip, then uses admin privileges only
for the actual send. Deployed with `npm run functions:deploy`.

### 6.4 Documents storage

One private bucket `trip-documents`, 25 MB per-file limit. Access is governed by
the same trip-membership functions — a document is reachable by exactly whoever
can edit its trip (owner or accepted editor), nothing more.

### 6.5 Secrets discipline (important)

- The Supabase **anon/publishable key** is a _public client credential_ protected
  by RLS — fine to ship in the browser and put in `.env.local`.
- The **`service_role` / secret key** and the **database password** are true
  secrets. They live only in Supabase (and in the edge function's server-side
  environment). **Never** put them in a `VITE_*` variable — Vite bundles those
  into the public JavaScript, which would be a full security breach. If anything
  ever asks you to paste the service-role key or DB password into app code, that
  is the signal to stop.

---

## 7. Environment variables

Configured in a **`.env.local`** file at the project root (gitignored — never
committed). Only variables prefixed `VITE_` reach the browser.

| Variable                   | Purpose                                                                                                                              | Secret?                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `VITE_SUPABASE_URL`        | Your Supabase project URL.                                                                                                           | Public                                 |
| `VITE_SUPABASE_ANON_KEY`   | Supabase anon/publishable key (RLS-protected).                                                                                       | Public                                 |
| `VITE_SITE_URL`            | The deployed app URL that magic-link emails redirect back to. Required in production; falls back to the current origin in local dev. | Public                                 |
| `VITE_GOOGLE_MAPS_API_KEY` | _(Optional)_ enables Google place search + Google map. Omit to use free OpenStreetMap instead.                                       | Public, but **restrict it** (see §9.6) |

The edge function additionally uses server-side `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SITE_URL` — these are set
in Supabase, **not** in the app.

---

## 8. Known rough edges & things NOT built yet (be honest with yourself)

- **`updated_at` column vs `data.updatedAt`**: the `touch_updated_at` trigger
  overwrites the table column with `now()` on every update, while the app's
  last-write-wins clock actually lives in `data.updatedAt` inside the JSON.
  Harmless today (reads use `data.updatedAt`), but must be reconciled before any
  real multi-device conflict resolution.
- **No true offline cold-start**: an already-open tab that loses connectivity
  keeps working, but opening the site fresh with zero network needs a service
  worker/PWA — not built.
- **Admin dashboard**: the RLS permission for an admin to see all trips exists,
  but there is no UI for it yet.
- **BizData & free tile/geocoder dependence**: fine for a hobby/small product,
  but a serious business should plan to move to paid, SLA-backed providers.
- **PDF export**: works including Hebrew (embedded font); money is shown as a
  currency _code_ ("1234 EUR"), not a symbol, because jsPDF's fonts don't carry
  all currency glyphs reliably.
- **Realtime collaboration** (two people editing live) is not built; sharing is
  invite + last-write-wins sync, not live co-editing.

---

## 9. Step-by-step: deploying TravelPal as a business

Do these in order. Each step is self-contained. Nothing here is destructive to
your local project.

### 9.1 Prerequisites (one-time)

1. Install **Node.js** (the project uses a recent version; on this machine Node
   lives at `C:\Program Files\nodejs`).
2. In the project folder, run `npm install`.
3. Confirm it builds cleanly: `npm run build`, then `npm run preview` to view it.
   Also run `npm run lint` and `npm test` — both should pass before you ship.

### 9.2 Create the Supabase project (the backend)

1. Go to supabase.com, create an account, create a **new project**. Choose a
   region close to your users. Save the database password somewhere safe (a
   password manager) — you will rarely need it, and it is a true secret.
2. In the project, open **Project Settings → API**. Copy the **Project URL** and
   the **anon/public key**. (Ignore the service-role key for app config — it is
   secret.)

### 9.3 Create the database schema

1. Open **SQL Editor → New query**.
2. Paste the entire contents of [supabase/schema.sql](supabase/schema.sql) and
   **Run**. It is idempotent and sets up all tables, RLS policies, functions,
   triggers, and the Storage bucket.
3. Sanity check: **Table Editor** should now show `trips`, `trip_members`,
   `pending_trip_invites`, `trip_share_links`; **Storage** should show a private
   `trip-documents` bucket.

### 9.4 Configure Auth (magic links)

1. **Authentication → Providers → Email**: ensure email sign-in is enabled.
2. **Authentication → URL Configuration**: set the **Site URL** to your final
   domain (e.g. `https://travelpal.com`) and add it (and any preview URLs) to the
   **Redirect URLs** allow-list. Magic links won't work if the redirect URL isn't
   listed.
3. _(Optional but recommended for a business)_ Configure a custom SMTP provider
   (e.g. Resend, Postmark, SendGrid) under **Authentication → Emails → SMTP** so
   sign-in and invite emails come from _your_ domain and don't hit Supabase's
   low default sending limits. Customize the "Magic Link" and "Invite user" email
   templates with your branding.

### 9.5 Deploy the invite edge function

1. Install the Supabase CLI (already a dev dependency here) and log in.
2. Link the project and run `npm run functions:deploy` (which runs
   `supabase functions deploy send-trip-invite`).
3. The function reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` from the function environment — set
   `SITE_URL` (and the service-role key if not auto-injected) in the Supabase
   dashboard under the function's secrets. **This is the only place the
   service-role key is ever used.**

### 9.6 _(Optional)_ Google Maps

Only if you want Google's search/map instead of the free OpenStreetMap one:

1. In Google Cloud Console, create a project, enable **Maps JavaScript API** and
   **Places API**, and create an **API key**.
2. **Restrict the key**: by HTTP referrer (your domain only) and by the two APIs
   above. An unrestricted key can be stolen from the browser and run up your
   bill.
3. Set a **billing budget/alert** — this API requires a card and is pay-as-you-go.

### 9.7 Build and host the app

1. Set production environment variables in your host's dashboard:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (= your domain),
   and optionally `VITE_GOOGLE_MAPS_API_KEY`.
2. Connect the repo to a static host (Vercel/Netlify/Cloudflare Pages). Build
   command: `npm run build`. Output directory: `dist`. These hosts auto-build on
   every git push.
3. Point your **domain** at the host (they provide DNS instructions) and enable
   HTTPS (automatic on all of them).
4. Confirm `VITE_SITE_URL` and the Supabase **Redirect URLs** both exactly match
   the live domain — mismatches are the #1 cause of "the magic link doesn't log
   me in".

### 9.8 Create the admin account (optional)

In Supabase: **Authentication → Add user** → set an email + password → tick
**Auto Confirm User**. Then grant the admin claim by running (in SQL Editor,
with your admin email) the commented statement at the bottom of the schema:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

### 9.9 Post-launch smoke test (do this on the live site)

Verify against the _running_ app, not the code:

- Sign in with a real email via magic link; confirm the redirect logs you in.
- Create a trip, edit it, reload — it persists. Sign in on a second device — the
  trip appears (cloud sync).
- Upload a document; confirm it appears on the other device (Storage sync).
- Share a trip by email to a second address; confirm the invite email and access.
- Create a view-only share link; open it in a private window (no account).
- Sign out; confirm "continue without an account" still works fully offline.

---

## 10. Costs & scaling (rough, plan-dependent — verify current pricing)

- **Static hosting + domain**: a few dollars a month at most to start (often just
  the ~US$12/yr domain; hosting free tier).
- **Supabase Free tier**: fine for launch (limited database size, storage,
  monthly active users, and edge-function invocations). Watch the **storage**
  usage — uploaded PDFs/passport scans are the thing most likely to grow.
- **Supabase Pro (~US$25/mo)**: the natural next step; higher limits, daily
  backups, no project pausing on inactivity.
- **Email**: Supabase's built-in email has low limits meant for testing. A real
  business should use custom SMTP (Resend/Postmark/SendGrid) — small volumes are
  cheap or free.
- **Google Maps (if enabled)**: pay-as-you-go after a monthly free credit. Set a
  budget alert. If you don't want any card on file, **leave it disabled** — the
  free OpenStreetMap path is fully functional.
- **Nominatim / BizData / OSM tiles**: free, but usage-policy-bound. If traffic
  grows, budget for a paid geocoder and paid map tiles.

---

## 11. Legal & business checklist (not legal advice — consult a professional)

- **Privacy policy & terms of service**: required once you collect emails and
  store user data. State what you store (email, trip content, uploaded files),
  where (Supabase, and its region), and how users can delete their data.
- **GDPR / data-deletion**: because a trip is one row plus files under a known
  path, honoring "delete my account and data" is straightforward (delete the
  user in Supabase → cascading deletes remove their trips; then purge their
  Storage folder). Document this process.
- **Cookie/consent**: the app uses localStorage for functional purposes, not
  ad-tracking. If you add analytics, disclose it.
- **Third-party attribution**: OpenStreetMap requires attribution on maps
  (already present in the Leaflet map). Respect Nominatim's and tile providers'
  usage policies. Keep the Noto Sans Hebrew font's SIL OFL license notice
  ([src/assets/fonts/NotoSansHebrew-OFL.txt](src/assets/fonts/NotoSansHebrew-OFL.txt)).
- **Backups**: on Supabase Pro you get automatic daily backups. Consider a
  periodic manual export of the `trips` table for peace of mind.
- **Monitoring**: turn on Supabase's logs/alerts; set the Google (if used) and
  hosting budget alerts. Know where to look when something breaks.

---

## 12. Day-to-day operational commands

| Task                       | Command                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Run locally                | `npm run dev` (or `Open Project Travel.bat`)                                                   |
| Lint                       | `npm run lint`                                                                                 |
| Run tests                  | `npm test`                                                                                     |
| Production build           | `npm run build`                                                                                |
| Preview the build          | `npm run preview`                                                                              |
| Deploy the invite function | `npm run functions:deploy`                                                                     |
| Update the DB schema       | Paste [supabase/schema.sql](supabase/schema.sql) into Supabase SQL Editor and Run (idempotent) |

---

## 13. First principles this project is built on (keep these)

1. **Verify against the running app** — measure the real DOM, make the real API
   call, read what actually landed in storage. Code looking right isn't "done".
2. **Distrust a surprising result before reporting it** — the flaw is often in
   the test, not the app.
3. **Root-cause, don't paper over.**
4. **Guard the user's data like it's real** — snapshot before risky changes,
   never leave test data or orphaned files behind.
5. **Right-size solutions; be honest about cost** — the biggest solution is
   rarely the right one.
6. **Secrets discipline** — public anon key is fine in the browser; the
   service-role key and DB password never touch app code.
7. **Keep it shippable** — lint and build stay clean; large work is phased so the
   app is never left broken.

```

```
