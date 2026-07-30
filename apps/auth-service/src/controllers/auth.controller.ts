import { asyncHandler, ApiReponse, ApiError } from "@repo/core/rest";
import { Request, Response } from "express";
import { AuthRepository } from "../repositories/auth.repositories";
import { RedisString } from "@repo/redis";
import { HttpStatus } from "../utils/httpStatus";
import logger from "../config/logger";

export const getUserDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const redisString = new RedisString();
    const authRepository = new AuthRepository();
    const userId = req.user?.userId;
    logger.trace(userId);

    if (!userId) {
      throw new ApiError(400, "User ID is required");
    }

    const cacheKey = `user:details:${userId}`;

    try {
      const cachedUser = await redisString.get(cacheKey);
      if (cachedUser) {
        const userData = JSON.parse(cachedUser);
        return res
          .status(HttpStatus.OK)
          .json(
            new ApiReponse(
              true,
              userData,
              "User details retrieved from cache",
              HttpStatus.OK,
            ),
          );
      }
    } catch (_err) {}

    const user = await authRepository.findUserById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const userData = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      provider: user.provider,
      isEmailVerified: user.isEmailVerified,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    };

    try {
      await redisString.set(cacheKey, JSON.stringify(userData), { EX: 3600 });
    } catch (_err) {}
    logger.trace(userData);
    return res
      .status(HttpStatus.OK)
      .json(
        new ApiReponse(
          true,
          userData,
          "User details retrieved successfully",
          HttpStatus.OK,
        ),
      );
  },
);
