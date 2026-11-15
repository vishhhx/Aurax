import { getSocket } from "./socket"
import { MarketStream } from "./market-stream"
import { UserStream } from "./user-stream"

let market: MarketStream | null = null
let user: UserStream | null = null

/** The one market-data multiplexer for the tab. */
export function getMarketStream(): MarketStream {
  market ??= new MarketStream(getSocket())
  return market
}

/** The one private-event stream for the tab. */
export function getUserStream(): UserStream {
  user ??= new UserStream(getSocket())
  return user
}

export { acquireSocket, reconnectSocket, getSocketSnapshot, subscribeSocket, getServerSocketSnapshot } from "./socket"
export type { ConnectionState, SocketSnapshot } from "./socket"
