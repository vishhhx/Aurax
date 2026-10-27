import type { Server, Socket } from "socket.io";
import { extractSocketToken, verifyToken } from "@repo/core/jwt";

import logger from "./config/logger";
import { registerMarketDataHandlers } from "./market/market-data";
import { userRoom } from "./private/user-events";

export interface GatewayOptions {
  jwtSecret: string;
}

export interface SessionInfo {
  authenticated: boolean;
  /** Present only for authenticated sockets */
  userId?: string;
  /** Why a presented token was not accepted (the socket stays public-only) */
  reason?: "invalid_token" | "expired_token";
}

/**
 * Access policy
 *
 * - PUBLIC (no login): market-data channels on socket event "market"
 *   (depth, trades, ticker, candles). These rooms only ever carry data
 *   produced by market-service, which contains no account information.
 * - PRIVATE (login required): the socket joins `user:<userId>` for the userId
 *   in its VERIFIED token, and receives socket event "user" (orders, fills,
 *   balances, deposits). There is no client-driven subscription to private
 *   data, so a client can never choose whose events it gets.
 *
 * A missing token → public-only session. An invalid or expired token is not
 * fatal either: the socket is public-only and told why (`session` event), so
 * the client can refresh its token and reconnect. Tokens are never logged.
 */
export function attachGateway(io: Server, options: GatewayOptions): void {
  io.use((socket, next) => {
    const token = extractSocketToken(socket);
    let session: SessionInfo = { authenticated: false };
    if (token) {
      try {
        const payload = verifyToken(token, options.jwtSecret);
        session = payload.userId
          ? { authenticated: true, userId: String(payload.userId) }
          : { authenticated: false, reason: "invalid_token" };
      } catch (error) {
        const expired = error instanceof Error && /expired/i.test(error.message);
        session = { authenticated: false, reason: expired ? "expired_token" : "invalid_token" };
      }
    }
    socket.data.session = session;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const session = socket.data.session as SessionInfo;

    if (session.authenticated && session.userId) {
      void socket.join(userRoom(session.userId));
    }
    socket.emit("session", session);
    registerMarketDataHandlers(socket);

    socket.on("error", (error) => {
      logger.warn({ err: error, socketId: socket.id }, "Socket error");
    });
  });
}
