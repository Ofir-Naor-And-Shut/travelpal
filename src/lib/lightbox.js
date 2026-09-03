import { useSyncExternalStore } from "react";

// A single, app-wide image preview. Any picture calls `openLightbox(url)`;
// one `PhotoLightbox` mounted at the root renders the centered overlay.
let current = "";
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function openLightbox(url) {
  if (!url) return;
  current = url;
  emit();
}

export function closeLightbox() {
  current = "";
  emit();
}

export function useLightbox() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
