import type { Request, Response, NextFunction } from "express";
import { ApiError } from "@repo/core/rest";
import {
  extractBearerToken,
  verifyToken,
  type UserPayload,
} from "@repo/core/jwt";
import { ENV } from "../config/env";

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractBearerToken(req) ?? req.cookies?.accessToken;
    if (!token) {
      throw new ApiError(401, "Access token required");
    }

    const payload = verifyToken(token, ENV.JWT_ACCESS_SECRET!) as UserPayload;

    req.user = payload;

    next();
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(new ApiError(401, "Invalid or expired access token"));
  }
};

