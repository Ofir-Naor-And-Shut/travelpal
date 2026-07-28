import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'project-travel:theme'

export const THEMES = ['light', 'dark', 'system']

const media = window.matchMedia('(prefers-color-scheme: dark)')

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

let preference = readStored()
const listeners = new Set()

/** The concrete theme in effect once `system` is resolved. */
export function resolveTheme(pref = preference) {
  if (pref === 'system') return media.matches ? 'dark' : 'light'
  return pref
}

function apply() {
  document.documentElement.dataset.theme = resolveTheme()
}

function emit() {
  apply()
  listeners.forEach((l) => l())
}

// Following the OS only matters while the preference is `system`.
media.addEventListener('change', () => {
  if (preference === 'system') emit()
})

apply()

export function setTheme(next) {
  if (!THEMES.includes(next)) return
  preference = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
  emit()
}

/** Cycle light → dark → system, which is what the header button does. */
export function cycleTheme() {
  const order = ['light', 'dark', 'system']
  setTheme(order[(order.indexOf(preference) + 1) % order.length])
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  const pref = useSyncExternalStore(
    subscribe,
    () => preference,
    () => preference,
  )
  return { preference: pref, theme: resolveTheme(pref) }
}
