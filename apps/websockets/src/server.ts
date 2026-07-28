import { connectToredis } from "@repo/redis";
await connectToredis();
import express from "express";

import { createServer } from "http";

import { Server } from "socket.io";
import { ENV } from "./config/env";
const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, {});

logger.info("Connected to Redis successfully");
import {
  extractSocketToken,
  type UserPayload,
  verifyToken,
} from "@repo/core/jwt";

import logger from "./config/logger";
import {
  handleSocketConnection,
  handleSocketDisconnect,
  handleSocketError,
} from "./handlers/connection.handlers";
import { setGlobalIO } from "./utils/socketManager";

setGlobalIO(io);

io.use(async (socket, next) => {
  try {
    const token = extractSocketToken(socket);
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = verifyToken(
      token,
      ENV.JWT_ACCESS_SECRET as string,
    ) as UserPayload;

    socket.data.authUser = {
      userId: String(payload.userId),
    };

    return next();
  } catch (error: any) {
    logger.error("Socket auth middleware error:", error);
    return next(new Error("Socket authentication failed"));
  }
});

io.on("connection", (socket) => {
  const authUser = socket.data.authUser;

  handleSocketConnection(socket, io, authUser);

  socket.on("disconnect", () => {
    handleSocketDisconnect(socket, authUser.id);
  });

  socket.on("error", (error) => {
    handleSocketError(socket, authUser.id, error);
  });
});

httpServer.listen(ENV.PORT, () => {
  logger.info(`websocket server is running on port ${ENV.PORT}`);
});
