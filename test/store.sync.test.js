import { test, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Walks through the dual-write cloud sync added to src/lib/store.js — create,
 * edit, delete, and sign-in reconcile — against a fake localStorage and a
 * fake Supabase `trips` table (no network, no real credentials needed).
 *
 * Scenarios run in order and build on each other (not isolated unit tests) —
 * it's a scripted run-through of the feature, closer to how the app is
 * actually used than a pile of independent unit tests would be.
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

function fakeSupabase() {
  return {
    from(tableName) {
      assert.equal(tableName, "trips");
      return {
        select() {
          return {
            eq(col, val) {
              const data = cloudRows
                .filter((r) => r[col] === val)
                .map((r) => ({ ...r }));
              return Promise.resolve({ data, error: null });
            },
          };
        },
        upsert(row) {
          const i = cloudRows.findIndex((r) => r.id === row.id);
          if (i >= 0) cloudRows[i] = { ...row };
          else cloudRows.push({ ...row });
          return Promise.resolve({ error: null });
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

// ---- fake auth session -----------------------------------------------------
let currentSession = null;
const sessionListeners = new Set();

function signIn(userId = "user-1") {
  currentSession = { user: { id: userId } };
  sessionListeners.forEach((l) => l());
}

function signOut() {
  currentSession = null;
  sessionListeners.forEach((l) => l());
}

// Must be registered before store.js (which imports these) is ever loaded.
mock.module(new URL("../src/lib/supabase.js", import.meta.url), {
  exports: { hasSupabase: true, supabase: fakeSupabase() },
});

mock.module(new URL("../src/lib/auth.js", import.meta.url), {
  exports: {
    getSession: () => currentSession,
    subscribeSession: (cb) => {
      sessionListeners.add(cb);
      return () => sessionListeners.delete(cb);
    },
  },
});

const store = await import("../src/lib/store.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("signed out: creating a trip saves locally only, no cloud push", async () => {
  const before = cloudRows.length;
  const id = store.createTrip({ title: "Offline trip" });
  await wait(20);
  assert.ok(
    localStorage.getItem(`project-travel:trip:${id}`),
    "saved to localStorage",
  );
  assert.equal(
    cloudRows.length,
    before,
    "no cloud row created while signed out",
  );
  store.deleteTrip(id);
});

test("sign-in reconcile adopts a pre-existing local trip into the cloud", async () => {
  const id = store.createTrip({ title: "Made before signing in" });
  signIn();
  await wait(50);
  const row = cloudRows.find((r) => r.id === id);
  assert.ok(row, "local trip got pushed to the cloud on sign-in");
  assert.equal(row.owner_id, "user-1");
  assert.equal(row.data.title, "Made before signing in");
});

test("editing a trip pushes to the cloud, debounced", async () => {
  const { activeId } = store.getTripRegistry();
  store.updateTrip({ title: "Edited title" });

  const rowSoonAfter = cloudRows.find((r) => r.id === activeId);
  assert.notEqual(
    rowSoonAfter?.data.title,
    "Edited title",
    "push is debounced, not immediate",
  );

  await wait(1700); // > the 1500ms debounce window
  const rowAfterDebounce = cloudRows.find((r) => r.id === activeId);
  assert.equal(
    rowAfterDebounce.data.title,
    "Edited title",
    "debounced push landed",
  );
});

test("deleting a trip removes it from the cloud too", async () => {
  const { activeId } = store.getTripRegistry();
  store.deleteTrip(activeId);
  await wait(20);
  assert.ok(!cloudRows.some((r) => r.id === activeId), "cloud row removed");
  assert.equal(localStorage.getItem(`project-travel:trip:${activeId}`), null);
});

test("reconcile adopts a cloud-only trip made on another device", async () => {
  const cloudOnlyId = "cloud-only-trip-1";
  cloudRows.push({
    id: cloudOnlyId,
    owner_id: "user-1",
    updated_at: new Date().toISOString(),
    data: {
      id: cloudOnlyId,
      title: "From my phone",
      destinations: [],
      days: {},
      updatedAt: new Date().toISOString(),
    },
  });

  // Re-trigger the false -> true sign-in transition to run reconcile again.
  signOut();
  signIn();
  await wait(50);

  const { trips } = store.getTripRegistry();
  assert.ok(
    trips.some((t) => t.id === cloudOnlyId),
    "cloud-only trip adopted locally",
  );
  assert.ok(
    localStorage.getItem(`project-travel:trip:${cloudOnlyId}`),
    "and persisted locally",
  );
});

test("reconcile keeps a newer local edit over a stale cloud row", async () => {
  const id = store.createTrip({ title: "Local wins" });
  await wait(20); // let the immediate create-push land

  // Simulate a stale cloud row for this trip: older updated_at, different title.
  const row = cloudRows.find((r) => r.id === id);
  row.updated_at = new Date(Date.now() - 60_000).toISOString();
  row.data = { ...row.data, title: "Stale cloud title" };

  signOut();
  signIn();
  await wait(50);

  const { trips } = store.getTripRegistry();
  const entry = trips.find((t) => t.id === id);
  assert.equal(
    entry.title,
    "Local wins",
    "newer local title was not overwritten by stale cloud data",
  );
});
