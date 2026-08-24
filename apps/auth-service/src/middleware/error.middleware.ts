import type { Request, Response, NextFunction } from "express";
import { ApiError } from "@repo/core/rest";
import logger from "../config/logger";

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error(err);

  if (err instanceof ApiError) {
    const apiError = err as ApiError;
    return res.status(apiError.statusCode).json({
      success: false,
      data: null,
      message: apiError.message,
      errors: apiError.errors || [],
      ...(process.env.NODE_ENV === "development" && apiError.stack ? { stack: apiError.stack } : {}),
    });
  }

  const isDev = process.env.NODE_ENV === "development";
  const message =
    isDev && err instanceof Error ? err.message : "Internal Server Error";
  const stack = isDev && err instanceof Error ? err.stack : undefined;

  return res.status(500).json({
    success: false,
    data: null,
    message,
    errors: [],
    ...(stack ? { stack } : {}),
  });
};

