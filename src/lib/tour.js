import { useSyncExternalStore } from "react";

/**
 * A tiny global store for the guided product tour, plus the two tours' step
 * data. Kept outside React (like i18n/theme) so any button anywhere — a Help
 * icon in the editor header, a "Take a tour" link on the picker — can launch
 * a tour by name without threading callbacks through the tree.
 *
 * Steps are pure data: a target selector (or none, for a centered card), an
 * optional `view` the editor should switch to before the step is shown, and a
 * string key. TourGuide resolves the copy through i18n as `tour.<name>.<id>`.
 */

const SEEN_KEY = "project-travel:tour-seen";
// Bump when a tour's steps change enough that returning users should see it
// again; older entries in the seen-set simply stop matching.
const TOUR_VERSION = "1";

let active = null; // null | "picker" | "editor"
const listeners = new Set();

const emit = () => listeners.forEach((l) => l());

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startTour(name) {
  active = name;
  emit();
}

export function stopTour() {
  active = null;
  emit();
}

export function useActiveTour() {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => active,
  );
}

function seenSet() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function hasSeenTour(name) {
  return seenSet().has(`${name}:${TOUR_VERSION}`);
}

export function markTourSeen(name) {
  const set = seenSet();
  set.add(`${name}:${TOUR_VERSION}`);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // Non-fatal: the tour just re-appears on the next first visit.
  }
}

/**
 * Editor walkthrough. A few steps set `view` first so the tab they describe
 * is actually on screen when its spotlight lands. The map step accepts either
 * the docked map (desktop) or the floating "Map" button (phone) — TourGuide
 * highlights whichever one is currently visible.
 */
export const EDITOR_TOUR = [
  { id: "intro" },
  { id: "tripMenu", target: '[data-tour="trip-menu"]' },
  { id: "controls", target: '[data-tour="controls"]' },
  { id: "budget", target: '[data-tour="budget-card"]' },
  { id: "plan", target: '[data-tour="tab-plan"]', view: "plan" },
  { id: "day", target: '[data-tour="tab-view"]', view: "view" },
  { id: "details", target: '[data-tour="tab-details"]', view: "details" },
  { id: "budgetTab", target: '[data-tour="tab-budget"]', view: "budget" },
  {
    id: "map",
    target: '[data-tour="map"], [data-tour="map-button"]',
    view: "plan",
  },
  { id: "outro" },
];

/** Landing-screen intro, shown before the editor tour on a first visit. */
export const PICKER_TOUR = [
  { id: "intro" },
  { id: "trips", target: '[data-tour="trip-grid"]' },
  { id: "new", target: '[data-tour="new-trip"]' },
  { id: "account", target: '[data-tour="account"]' },
  { id: "controls", target: '[data-tour="controls"]' },
  { id: "outro" },
];
