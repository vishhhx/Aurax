/** Minimal external store for useSyncExternalStore (module-level shared state). */
export interface ExternalStore<T> {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (next) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next
      if (Object.is(value, state)) return
      state = value
      listeners.forEach((l) => l())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
