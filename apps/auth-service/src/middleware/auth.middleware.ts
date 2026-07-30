import { Request, Response, NextFunction } from "express";
import { extractBearerToken, verifyToken, UserPayload } from "@repo/core/jwt";
import { ENV } from "../config/env";
import { ApiError } from "@repo/core/rest";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token = extractBearerToken(req);

    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new ApiError(401, "Access token required");
    }

    const payload = verifyToken(
      token,
      ENV.JWT_ACCESS_SECRET!,
    ) as UserPayload;

    req.user = payload;
    next();
  } catch (error: any) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(401).json({
      success: false,
      message: error?.message || "Invalid or expired access token",
    });
  }
};
