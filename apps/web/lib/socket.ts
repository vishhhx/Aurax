import { io, Socket } from "socket.io-client"

export interface SocketSession {
  authenticated: boolean
  userId?: string
  reason?: "invalid_token" | "expired_token"
}

let socket: Socket | null = null
let session: SocketSession | null = null
const sessionListeners = new Set<() => void>()

/**
 * One socket per tab. Public market data works without login; when the
 * browser has an `accessToken` cookie (withCredentials) the gateway also
 * authenticates the socket for private events and announces it via the
 * "session" event, which is captured here so late subscribers see it.
 */
export const getSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL as string, {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    })
    socket.on("session", (s: SocketSession) => {
      session = s
      sessionListeners.forEach((l) => l())
    })
    socket.on("disconnect", () => {
      session = null
      sessionListeners.forEach((l) => l())
    })
  }
  return socket
}

export const getSocketSession = () => session
export const subscribeSocketSession = (listener: () => void) => {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}
