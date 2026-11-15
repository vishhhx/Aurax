import type { CandleInterval } from "@/lib/api/types"
import { createExternalStore } from "./external-store"

/**
 * Per-device preferences. The backend has no preferences or watchlist API
 * (missing-backend-capabilities.md #12), so these live in localStorage and
 * the UI says they apply to this browser only. Never holds credentials.
 */

export interface Preferences {
  version: 1
  favorites: string[]
  confirmOrders: boolean
  fillToasts: boolean
  chartInterval: CandleInterval
}

const KEY = "aurax.preferences"

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  favorites: [],
  confirmOrders: false,
  fillToasts: true,
  chartInterval: "15m",
}

function read(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<Preferences>
    if (parsed.version !== 1) return DEFAULT_PREFERENCES
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((f) => typeof f === "string") : [],
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export const preferencesStore = createExternalStore<Preferences>(DEFAULT_PREFERENCES)
let hydrated = false

/** Loads stored preferences once on the client (after hydration, to keep SSR output stable). */
export function hydratePreferences() {
  if (hydrated || typeof window === "undefined") return
  hydrated = true
  preferencesStore.set(read())
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) preferencesStore.set(read())
  })
}

export function updatePreferences(patch: Partial<Omit<Preferences, "version">>) {
  preferencesStore.set((p) => {
    const next = { ...p, ...patch }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage full or disabled: keep the in-memory value.
    }
    return next
  })
}

export function toggleFavorite(symbol: string) {
  const { favorites } = preferencesStore.get()
  updatePreferences({ favorites: favorites.includes(symbol) ? favorites.filter((f) => f !== symbol) : [...favorites, symbol] })
}
