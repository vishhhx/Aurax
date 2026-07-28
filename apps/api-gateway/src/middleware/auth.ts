import { NextFunction, Request, Response } from "express";
import { extractBearerToken, verifyToken, UserPayload } from "@repo/core/jwt";
import { ENV } from "../config/env";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const payload = verifyToken(
      token,
      ENV.JWT_ACCESS_SECRET!,
    ) as UserPayload;

    req.user = payload;

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
};
