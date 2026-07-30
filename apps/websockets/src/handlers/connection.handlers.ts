import type { Server, Socket } from "socket.io";

import { SocketRepository } from "../utils/redis";
import logger from "../config/logger";

type SocketAuthUser = {
  userId: string;
};
export const handleSocketConnection = async (
  socket: Socket,
  io: Server,
  authUser: SocketAuthUser,
) => {
  try {
    const socketRepo = new SocketRepository();
    const { userId } = authUser;
    logger.info(`User ${userId} connected with socket: ${socket.id}`);
    await socketRepo.add(`socket:${userId}`, socket.id);
  } catch (error: any) {
    logger.error("Error occurred while handling socket connection:", error);
  }
};

export const handleSocketDisconnect = async (
  socket: Socket,
  userId: string,
) => {
  logger.info(` User disconnected: ${userId}) Socket ID: ${socket.id}`);
  try {
    const socketRepo = new SocketRepository();
    const result = await socketRepo.remove(userId, socket.id);
    logger.info(
      `Socket ID for user ${userId} removed from Redis. Result: ${result}`,
    );
  } catch (error: any) {
    logger.error("  Error removing socket ID from Redis:", error);
  }
};

export const handleSocketError = (
  socket: Socket,
  userId: string,
  error: Error | any,
) => {
  logger.error(` Socket error for ${userId}:`, error);
};
