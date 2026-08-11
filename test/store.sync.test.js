import { test, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Walks through store.js's cloud-only architecture: signed-in trips live
 * only in Supabase (never localStorage); local-only (no account) trips keep
 * using localStorage exactly as before; sign-in adopts local trips into the
 * account and wipes their local copies; sign-out falls back to local-only
 * again; and a failed cloud fetch falls back to an explicitly downloaded
 * offline copy. All against fakes — no network, no real credentials, no
 * real IndexedDB.
 *
 * Scenarios run in order and build on each other (not isolated unit tests) —
 * a scripted run-through of the feature.
 *
 * Run with: npm test
 */

// ---- fake localStorage -----------------------------------------------------
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
};

// store.js pulls in i18n.js, which touches document at import time to apply
// lang/dir attributes — stub just enough of the DOM for that (Node already
// has a read-only global `navigator`, whose `.language` being undefined is
// handled fine by i18n.js's own optional chaining).
globalThis.document = { documentElement: { lang: "", dir: "" } };

// ---- fake Supabase `trips` table -------------------------------------------
const cloudRows = []; // stands in for the Postgres table
let failNextFetch = false;
let failUpsertForId = null; // simulate one trip's push failing (e.g. a blip)

function fakeSupabase() {
  return {
    from(tableName) {
      // Sharing (trip_members / trip_share_links) isn't exercised by this
      // scripted run-through — just enough of trip_members to let
      // enterCloudMode's "any shared-with-me trips?" check no-op.
      if (tableName === "trip_members") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }
      assert.equal(tableName, "trips");
      return {
        select() {
          return {
            eq(col, val) {
              if (failNextFetch) {
                failNextFetch = false;
                return Promise.resolve({
                  data: null,
                  error: { message: "network error" },
                });
              }
              const data = cloudRows
                .filter((r) => r[col] === val)
                .map((r) => ({ ...r }));
              return Promise.resolve({ data, error: null });
            },
          };
        },
        upsert(row) {
          if (row.id === failUpsertForId) {
            return Promise.resolve({ error: { message: "upsert failed" } });
          }
          const i = cloudRows.findIndex((r) => r.id === row.id);
          if (i >= 0) cloudRows[i] = { ...row };
          else cloudRows.push({ ...row });
          return Promise.resolve({ error: null });
        },
        update(patch) {
          return {
            eq(col, val) {
              const i = cloudRows.findIndex((r) => r[col] === val);
              if (i >= 0) cloudRows[i] = { ...cloudRows[i], ...patch };
              return Promise.resolve({ error: null });
            },
          };
        },
        delete() {
          return {
            eq(col, val) {
              const i = cloudRows.findIndex((r) => r[col] === val);
              if (i >= 0) cloudRows.splice(i, 1);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

// ---- fake auth: session + local-only choice --------------------------------
let currentSession = null;
let localOnlyFlag = true; // "continue without an account", chosen from the start
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function signIn(userId = "user-1") {
  currentSession = { user: { id: userId } };
  notify();
}

function signOut() {
  currentSession = null;
  notify();
}

// ---- fake offline cache (stands in for IndexedDB via offlineCache.js) -----
const offlineMap = new Map();

// Must be registered before store.js (which imports these) is ever loaded.
mock.module(new URL("../src/lib/supabase.js", import.meta.url), {
  exports: { hasSupabase: true, supabase: fakeSupabase() },
});

mock.module(new URL("../src/lib/auth.js", import.meta.url), {
  exports: {
    getSession: () => currentSession,
    subscribeSession: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLocalOnly: () => localOnlyFlag,
    subscribeLocalOnly: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  },
});

mock.module(new URL("../src/lib/offlineCache.js", import.meta.url), {
  exports: {
    saveTripOffline: async (trip) => {
      offlineMap.set(trip.id, trip);
    },
    isTripDownloaded: async (id) => offlineMap.has(id),
    loadAllOfflineTrips: async () => [...offlineMap.values()],
  },
});

const store = await import("../src/lib/store.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("local-only: creating a trip saves to localStorage, no cloud calls", async () => {
  assert.equal(store.isCloudMode(), false);
  const before = cloudRows.length;
  const id = store.createTrip({ title: "Offline-first trip" });
  await wait(20);
  assert.ok(
    localStorage.getItem(`project-travel:trip:${id}`),
    "saved to localStorage",
  );
  assert.equal(cloudRows.length, before, "no cloud row while local-only");
});

test("signing in adopts local trips into the cloud and clears localStorage", async () => {
  const { trips } = store.getTripRegistry();
  const localIds = trips.map((t) => t.id);
  assert.ok(localIds.length > 0);

  signIn();
  await wait(50);

  assert.equal(store.isCloudMode(), true);
  for (const id of localIds) {
    assert.ok(
      cloudRows.some((r) => r.id === id),
      `trip ${id} was pushed to the cloud`,
    );
    assert.equal(
      localStorage.getItem(`project-travel:trip:${id}`),
      null,
      "local copy was cleared once adopted",
    );
  }
});

test("editing while signed in pushes to the cloud, debounced, never touches localStorage", async () => {
  const { activeId } = store.getTripRegistry();
  store.updateTrip({ title: "Edited while signed in" });

  const soonAfter = cloudRows.find((r) => r.id === activeId);
  assert.notEqual(
    soonAfter?.data.title,
    "Edited while signed in",
    "push is debounced, not immediate",
  );
  assert.equal(localStorage.getItem(`project-travel:trip:${activeId}`), null);

  await wait(1700); // > the 1500ms debounce window
  const afterDebounce = cloudRows.find((r) => r.id === activeId);
  assert.equal(afterDebounce.data.title, "Edited while signed in");
  assert.equal(localStorage.getItem(`project-travel:trip:${activeId}`), null);
});

test("creating a trip while signed in goes straight to the cloud, not localStorage", async () => {
  const id = store.createTrip({ title: "Made while signed in" });
  await wait(20);
  const row = cloudRows.find((r) => r.id === id);
  assert.ok(row, "pushed immediately");
  assert.equal(row.data.title, "Made while signed in");
  assert.equal(localStorage.getItem(`project-travel:trip:${id}`), null);
});

test("deleting a trip while signed in removes the cloud row", async () => {
  const { activeId } = store.getTripRegistry();
  store.deleteTrip(activeId);
  await wait(20);
  assert.ok(!cloudRows.some((r) => r.id === activeId));
});

test("signing out falls back to local-only mode", async () => {
  signOut();
  await wait(20);
  assert.equal(store.isCloudMode(), false);
  const { activeId } = store.getTripRegistry();
  assert.ok(
    localStorage.getItem(`project-travel:trip:${activeId}`),
    "local-only trip set is persisted again",
  );
});

test("a failed cloud fetch on sign-in falls back to a downloaded offline copy", async () => {
  const offlineId = "offline-cached-trip";
  offlineMap.set(offlineId, {
    id: offlineId,
    title: "Downloaded before going offline",
    destinations: [],
    days: {},
    updatedAt: new Date().toISOString(),
  });

  failNextFetch = true;
  signIn();
  await wait(50);

  assert.equal(store.isCloudMode(), true);
  const { trips } = store.getTripRegistry();
  assert.ok(
    trips.some((t) => t.id === offlineId),
    "showing the downloaded copy since the live fetch failed",
  );
});

test("adoption keeps a trip locally when its cloud push fails (no silent data loss)", async () => {
  // Back to local-only so freshly created trips live in localStorage and are
  // candidates for adoption on the next sign-in.
  signOut();
  await wait(20);
  assert.equal(store.isCloudMode(), false);

  const okId = store.createTrip({ title: "Adopts cleanly" });
  const failId = store.createTrip({ title: "Push will fail" });
  await wait(20);
  assert.ok(localStorage.getItem(`project-travel:trip:${okId}`));
  assert.ok(localStorage.getItem(`project-travel:trip:${failId}`));

  // Make exactly one trip's adoption push fail, then sign in.
  failUpsertForId = failId;
  signIn();
  await wait(50);
  failUpsertForId = null;

  assert.equal(store.isCloudMode(), true);

  // The trip that pushed cleanly is now cloud-only.
  assert.ok(
    cloudRows.some((r) => r.id === okId),
    "adopted trip reached the cloud",
  );
  assert.equal(
    localStorage.getItem(`project-travel:trip:${okId}`),
    null,
    "adopted trip's local copy was cleared",
  );

  // The trip whose push failed must NOT have been wiped — it never reached the
  // cloud, so localStorage is the only copy left. This is the data-loss guard.
  assert.ok(
    !cloudRows.some((r) => r.id === failId),
    "failed trip did not reach the cloud",
  );
  assert.ok(
    localStorage.getItem(`project-travel:trip:${failId}`),
    "failed trip kept in localStorage as a fallback",
  );
  // And because not everything adopted, the index is kept so a later sign-out
  // still finds the survivor.
  assert.ok(
    localStorage.getItem("project-travel:index"),
    "index kept when not all trips adopted",
  );
});
