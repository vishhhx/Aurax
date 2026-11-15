"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toApiError } from "@/lib/api/client"
import { getUserStream } from "@/lib/ws"
import type { UserMessage } from "@/lib/ws/schemas"
import { useAppSelector } from "@/hooks/useRedux"
import { selectIsAuthenticated, selectIsSessionPending } from "@/store/slices/auth"

export function useAuth() {
  const user = useAppSelector((s) => s.auth.user)
  const status = useAppSelector((s) => s.auth.status)
  const error = useAppSelector((s) => s.auth.error)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const isPending = useAppSelector(selectIsSessionPending)
  return { user, status, error, isAuthenticated, isPending }
}

/**
 * Sends signed-out visitors to /login?next=<this page>. Waits for the session
 * check: redirecting while it is still pending causes flicker on reload.
 */
export function useRequireAuth() {
  const router = useRouter()
  const pathname = usePathname()
  const auth = useAuth()
  useEffect(() => {
    if (auth.status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [auth.status, router, pathname])
  return auth
}

/** Private socket events, already validated and deduplicated by eventId. */
export function useUserEvents(handler: (m: UserMessage) => void): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => getUserStream().subscribe((m) => ref.current(m)), [])
}

export interface PagedList<T> {
  rows: T[]
  status: "loading" | "ready" | "error"
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  reload: () => void
}

/**
 * Keyset paging for the newest-first history endpoints: the next page is
 * `before=<id of the last row>`, and a short page is the last one.
 */
export function usePagedList<T>(
  fetchPage: (before: string | undefined, limit: number) => Promise<T[]>,
  idOf: (row: T) => string,
  { pageSize = 50, enabled = true, key = "" }: { pageSize?: number; enabled?: boolean; key?: string } = {},
): PagedList<T> {
  const [state, setState] = useState<{ key: string; rows: T[]; status: PagedList<T>["status"]; error: string | null; hasMore: boolean; loadingMore: boolean }>({
    key: "",
    rows: [],
    status: "loading",
    error: null,
    hasMore: false,
    loadingMore: false,
  })
  const [nonce, setNonce] = useState(0)
  const fetchRef = useRef(fetchPage)
  const idRef = useRef(idOf)
  useEffect(() => {
    fetchRef.current = fetchPage
    idRef.current = idOf
  })
  const tag = `${key}:${nonce}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchRef
      .current(undefined, pageSize)
      .then((rows) => !cancelled && setState({ key: tag, rows, status: "ready", error: null, hasMore: rows.length === pageSize, loadingMore: false }))
      .catch((err: unknown) => !cancelled && setState({ key: tag, rows: [], status: "error", error: toApiError(err).message, hasMore: false, loadingMore: false }))
    return () => {
      cancelled = true
    }
  }, [enabled, pageSize, tag])

  const current = state.key === tag ? state : { key: tag, rows: [] as T[], status: "loading" as const, error: null, hasMore: false, loadingMore: false }

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  const loadMore = useCallback(() => {
    const s = stateRef.current
    if (s.key !== tag || !s.hasMore || s.loadingMore || s.rows.length === 0) return
    const before = idRef.current(s.rows[s.rows.length - 1]!)
    stateRef.current = { ...s, loadingMore: true }
    setState((p) => (p.key === tag ? { ...p, loadingMore: true, error: null } : p))
    fetchRef
      .current(before, pageSize)
      .then((rows) =>
        setState((p) => {
          if (p.key !== tag) return p
          const seen = new Set(p.rows.map(idRef.current))
          return { ...p, rows: [...p.rows, ...rows.filter((r) => !seen.has(idRef.current(r)))], hasMore: rows.length === pageSize, loadingMore: false }
        }),
      )
      .catch((err: unknown) => setState((p) => (p.key === tag ? { ...p, loadingMore: false, error: toApiError(err).message } : p)))
  }, [tag, pageSize])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { ...current, loadMore, reload }
}
