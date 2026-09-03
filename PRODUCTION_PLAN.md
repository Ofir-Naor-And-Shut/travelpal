# TravelPal — Production Readiness Plan

_Last updated: 2026-09-02_

This is a prioritized plan for taking TravelPal from a personal, local-first app
to a production service with real users. It reflects the app's guiding
principles: local-first stays the working copy, graceful degradation, honesty
about trade-offs, and right-sized solutions over the biggest possible one.

Effort is marked **S / M / L** (small / medium / large) rather than time
estimates. Severity is marked 🔴 blocker / 🟠 important / 🟢 nice-to-have.

---

## TL;DR — recommended sequencing

1. **Phase 0 (blockers)** — photos rethink, Google key lockdown, Supabase
   security pass, the `updated_at` clock reconciliation, secrets hygiene.
2. **Phase 1** — hosting, CI/CD, documents → Storage bucket.
3. **Phase 2** — monitoring, billing alerts, rate-limiting/abuse protection.
4. **Phase 3** — legal/compliance (privacy, attribution, data export/delete).
5. **Phase 4** — performance & PWA polish.

Do **Phase 0** before inviting any real users. The rest can follow in order.

---

## Phase 0 — Pre-production hardening (blockers)

### 0.1 Photos: change the source, not just the caching 🔴 (M)

**Why:** At production scale the current Google Places photo model has three
problems that don't matter for personal use:

- **Google's Terms restrict caching Places content.** Only `place_id` is
  storable long-term; persisting photo URLs / names in Supabase and syncing
  them across devices is offside. (The self-heal refetch helps, but the model
  is still grey.)
- **Cost scales by users and uses a pricey SKU.** Every stop and attraction
  auto-fires a Text Search. Pennies × many users × repeated expiry cycles adds
  up, and is unbounded if the client key is scraped.
- **Fit/quality.** Places photos are user-uploaded shots of specific
  businesses; trip covers and destination cards want curated travel
  photography.

**Decision (taken):** decorative photos now come from **Pexels**
(`src/lib/pexels.js`, gated on `VITE_PEXELS_API_KEY`). Google is no longer used
for any imagery, and **attraction photos were removed entirely** rather than
kept on a place-specific source.

- [x] Move **decorative photos** (trip cover + destination cards) to
      **Pexels**. Their CDN URLs are stable and cacheable (kills the expiry bug
      and let the self-heal machinery be deleted on those surfaces), licensing
      permits storing the URL, and the free tier is generous.
- [x] Drop Google from photos: `fetchPlacePhotos` / `attractionsQuery` removed,
      Place Details no longer requests the `photos` field, and the attraction
      thumbnail + its lazy fetch/self-heal were removed.
- [x] Honor attribution — a "Photos from Pexels" credit (i18n `photo.pexels`)
      links back to Pexels in the trip-picture popover.
- [ ] If any Google-sourced photo/data is ever retained again, store
      **`place_id`** and re-resolve on demand rather than persisting photo URLs.

**Note:** The existing self-heal (`refreshTripPhoto` / `refreshDestinationPhoto`
/ `refreshAttractionPhoto`) is the correct fallback **if** Google is retained on
a surface. It is not wasted work — it just becomes unnecessary on surfaces moved
to a stock-photo API.

### 0.2 Lock down the Google Maps API key 🔴 (S)

The Maps JS key is _meant_ to be public, but only safe when restricted.

- [ ] Add **HTTP-referrer restrictions** limiting the key to production
      domain(s) + localhost for dev.
- [ ] Restrict the key to **only the APIs actually used** (Maps JS, Places).
- [ ] Set **per-API quota caps** so a leak can't run up an unbounded bill.
- [ ] Turn on **billing alerts / budget** in Google Cloud (see 2.2).

### 0.3 Supabase security pass 🔴 (M)

The schema is already solid (owner RLS, `SECURITY DEFINER` functions to avoid
policy recursion, an owner-protection trigger). Verify the rest before launch:

- [ ] Confirm **RLS is enabled on every table** (`trips`, `trip_members`,
      `pending_trip_invites`, `trip_share_links`) and there are no
      `FOR ALL … USING (true)` gaps.
- [ ] Confirm **`anon` has no table privileges** except the intended read-only
      share-link RPC path.
- [ ] Confirm the **`service_role` / secret key and DB password never reach the
      client** — only the anon/publishable key is in `.env.local` (it is protected
      by RLS; that is correct).
- [ ] Review the **`send-trip-invite` edge function**: validate/authorize the
      caller, rate-limit it, and confirm it uses the service key server-side only.
- [ ] Review **share-link tokens**: sufficient entropy, revocable, and read-only
      via `get_trip_by_share_token` only.
- [ ] Plan the **Storage bucket RLS** now (owner/member-scoped) for when
      documents move off IndexedDB (see 1.3).
- [ ] Enable Supabase **email rate limits** and confirm the magic-link flow
      can't be used to spam arbitrary addresses (see 2.3).

### 0.4 Reconcile the `updated_at` clock 🟠 (S/M)

**Known issue (from `schema.sql` + CLAUDE.md):** the `touch_updated_at` trigger
overwrites the `updated_at` **column** with `now()` on every update, while the
client's last-write-wins clock lives in **`data.updatedAt`** inside the JSON.
Harmless today (reads use `data.updatedAt`), but it must be reconciled before
real multi-device conflict resolution can be trusted.

- [ ] Decide the single source of truth for the LWW clock (recommend the
      column, set from the client value) and make the trigger and client agree.
- [ ] Add a regression test alongside `test/store.sync.test.js`.

### 0.5 Secrets & environment hygiene 🔴 (S)

- [ ] Confirm `.env.local` is gitignored and **no secret** (service_role, DB
      password, any private API key) is ever committed or bundled.
- [ ] Move any server-only keys (Unsplash/Pexels secret if required, invite
      function keys) into **Supabase function secrets / hosting env vars**, not the
      client bundle.
- [ ] Document required env vars in the README (names only, not values).

---

## Phase 1 — Infrastructure & deployment

### 1.1 Hosting & build 🟠 (S)

- [ ] Deploy the static SPA to a CDN host (Vercel / Netlify / Cloudflare Pages).
- [ ] Configure **SPA fallback** routing and long-cache immutable assets.
- [ ] Set production env vars in the host (Supabase URL + anon key, Maps key,
      photo API key).

### 1.2 CI/CD 🟠 (S/M)

- [ ] CI runs `npm run lint`, `npm run build`, and `npm test` on every PR.
- [ ] Block merge/deploy on failure.
- [ ] Automated preview deploys per PR (optional but valuable).

### 1.3 Documents → Storage bucket (phase 2 of the backend) 🟠 (M)

Today booking PDFs / passport scans live only in **IndexedDB** (local-only).
For cross-device use they need a private Storage bucket.

- [ ] Create a private bucket with **owner/member-scoped RLS**.
- [ ] Upload on save; keep IndexedDB as the local-first cache.
- [ ] Signed URLs for retrieval; never public.
- [ ] Migrate/adopt existing local blobs on first cloud sync (mirror the trip
      adoption pattern already in `store.js`).
- [ ] Keep documents **out of Postgres** (only references), as already designed.

---

## Phase 2 — Reliability & observability

### 2.1 Error monitoring 🟠 (S)

- [ ] Add client error tracking (e.g. Sentry) with source maps.
- [ ] Capture failed syncs, failed photo fetches, and auth errors specifically.

### 2.2 Cost guardrails & billing alerts 🔴 (S)

- [ ] Google Cloud **budget + alerts** on the Maps/Places project.
- [ ] Supabase **usage alerts** (DB, egress, auth emails, Storage).
- [ ] Photo-API usage alerts (Unsplash/Pexels).

### 2.3 Rate-limiting & abuse protection 🟠 (M)

- [ ] Rate-limit the **magic-link** send path (per email + per IP) to prevent
      spam and bill abuse.
- [ ] Rate-limit the **invite** edge function.
- [ ] Consider a lightweight bot/abuse check on sign-in.

### 2.4 Backups & recovery 🟠 (S)

- [ ] Confirm Supabase **point-in-time recovery / daily backups** are on for the
      production tier.
- [ ] Document a restore procedure.

---

## Phase 3 — Legal & compliance

### 3.1 Privacy & data rights 🔴 (M)

You're storing user accounts + trip data + uploaded documents (passports!).

- [ ] Publish a **privacy policy** (what's stored, where, retention, third
      parties: Supabase, Google, photo API).
- [ ] Provide **data export** and **account/trip deletion** (deletion largely
      exists via `deleteTrip` / cascade; add account-level delete).
- [ ] Treat uploaded documents as **sensitive** — private Storage only, signed
      URLs, clear retention/delete.
- [ ] If serving the EU/UK, address **GDPR** basics (lawful basis, DSR process).

### 3.2 Third-party attribution & terms 🟠 (S)

- [ ] **Photo attribution** for Unsplash/Pexels (and Google if retained).
- [ ] **Leaflet / basemap tile** attributions present and correct for the
      providers in use (check each of the four basemaps' terms for production use).
- [ ] Google Maps **attribution + ToS** compliance if any Google surface stays.

### 3.3 Terms of Service 🟢 (S)

- [ ] Basic ToS for the service.

---

## Phase 4 — Performance & UX polish

### 4.1 Bundle size / code-splitting 🟠 (S/M)

Build currently emits a single ~1.37 MB JS chunk (Vite warns > 500 kB).

- [ ] Code-split heavy, rarely-first-paint deps (`jspdf` + `html2canvas` for PDF
      export, the Google map surface) behind dynamic `import()`.
- [ ] Re-check gzip sizes after splitting.

### 4.2 PWA / offline 🟢 (M)

The app is already local-first; a PWA shell makes "works offline" real.

- [ ] Add a service worker + manifest (installable, offline app shell).
- [ ] Cache the app shell + map tiles the user has seen (respect tile ToS).

### 4.3 Accessibility & i18n QA 🟠 (S/M)

- [ ] Verify RTL (Hebrew) across every screen at phone (~375px) and desktop
      (≥1280px) widths — the two-pane boundary is `lg:`.
- [ ] Keyboard/focus and screen-reader pass on the core flows.
- [ ] Lighthouse: performance, a11y, best-practices, SEO.

### 4.4 Analytics (privacy-respecting) 🟢 (S)

- [ ] Optional, cookieless analytics (e.g. Plausible) if you want usage signal —
      disclosed in the privacy policy.

---

## Phase 5 — Post-launch / roadmap

- [ ] **Realtime** sync (Supabase Realtime) — the schema anticipates it.
- [ ] Sharing UX refinements once multi-user is exercised in the wild.
- [ ] Revisit the new Google Places API (`Place`) if Google surfaces remain, as
      the legacy `PlacesService` is deprecated for new customers.

---

## Open decisions (need your input)

1. **Photo source:** ~~Unsplash vs. Pexels~~ — **decided: Pexels** for
   decorative photos (trip cover + destination cards); Google dropped from
   imagery and attraction photos removed.
2. **Hosting target:** Vercel / Netlify / Cloudflare Pages?
3. **Regions/compliance:** EU/UK users at launch? (Determines GDPR scope.)
4. **Free vs. paid tiers:** any usage limits per user to cap third-party cost?

---

## Severity summary

| Item                            | Severity | Effort |
| ------------------------------- | -------- | ------ |
| 0.1 Photo source rethink        | 🔴       | M      |
| 0.2 Google key lockdown         | 🔴       | S      |
| 0.3 Supabase security pass      | 🔴       | M      |
| 0.4 `updated_at` reconciliation | 🟠       | S/M    |
| 0.5 Secrets hygiene             | 🔴       | S      |
| 1.1 Hosting & build             | 🟠       | S      |
| 1.2 CI/CD                       | 🟠       | S/M    |
| 1.3 Documents → Storage         | 🟠       | M      |
| 2.2 Billing alerts              | 🔴       | S      |
| 2.3 Rate-limiting               | 🟠       | M      |
| 3.1 Privacy & data rights       | 🔴       | M      |
| 4.1 Bundle splitting            | 🟠       | S/M    |
