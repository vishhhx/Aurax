import { io, type Socket } from "socket.io-client"
import { sessionSchema, type SocketSession } from "./schemas"

/**
 * The single socket.io connection for the tab. Public market data works
 * without a session; with an accessToken cookie (withCredentials) the gateway
 * authenticates the socket, joins it to the caller's private room and says so
 * in the "session" event. Heartbeats are socket.io ping/pong (25 s / 20 s).
 *
 * Connection state lives in a small external store for useSyncExternalStore.
 */

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5005"

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline"

export interface SocketSnapshot {
  state: ConnectionState
  session: SocketSession | null
  /** Increments on every successful (re)connect; consumers refetch HTTP state when it changes. */
  epoch: number
}

let socket: Socket | null = null
let users = 0
let snapshot: SocketSnapshot = { state: "idle", session: null, epoch: 0 }
const listeners = new Set<() => void>()

function set(patch: Partial<SocketSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

export function subscribeSocket(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const getSocketSnapshot = () => snapshot
const SERVER_SNAPSHOT: SocketSnapshot = { state: "idle", session: null, epoch: 0 }
export const getServerSocketSnapshot = () => SERVER_SNAPSHOT

export function getSocket(): Socket {
  if (socket) return socket
  const s = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnectionDelay: 500,
    reconnectionDelayMax: 8_000,
  })
  s.on("connect", () => set({ state: "connected", epoch: snapshot.epoch + 1 }))
  s.on("disconnect", (reason) => {
    // "io client disconnect" is our own disconnect(): stay idle, not reconnecting.
    set({ state: reason === "io client disconnect" ? "idle" : "reconnecting", session: null })
  })
  s.on("connect_error", () => set({ state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting" }))
  s.io.on("reconnect_attempt", () => set({ state: "reconnecting" }))
  s.io.on("reconnect_failed", () => set({ state: "offline" }))
  s.on("session", (raw: unknown) => {
    const parsed = sessionSchema.safeParse(raw)
    set({ session: parsed.success ? parsed.data : { authenticated: false } })
  })
  if (typeof window !== "undefined") {
    window.addEventListener("offline", () => {
      if (!s.connected) set({ state: "offline" })
    })
    // A network blip may never drop the socket; report its real state when the browser is back online.
    window.addEventListener("online", () => {
      if (s.connected) set({ state: "connected" })
      else if (users > 0) s.connect()
    })
  }
  socket = s
  return s
}

/** Reference-counted connect; the provider acquires on mount. */
export function acquireSocket(): () => void {
  const s = getSocket()
  users += 1
  if (!s.connected && !s.active) {
    set({ state: "connecting" })
    s.connect()
  }
  return () => {
    users -= 1
    if (users <= 0) {
      users = 0
      s.disconnect()
    }
  }
}

/**
 * Reconnect so the gateway re-reads the accessToken cookie (after sign-in, a
 * token refresh, or sign-out). Market subscriptions are restored on connect.
 */
export function reconnectSocket(): void {
  const s = getSocket()
  if (users === 0) return
  s.disconnect()
  set({ state: "connecting" })
  s.connect()
}
