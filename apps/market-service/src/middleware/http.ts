import type { NextFunction, Request, Response } from "express";
import { ApiError, ApiReponse } from "@repo/core/rest";

import logger from "../config/logger";
import { health } from "../health";

/** Data endpoints depend on initialised market state; refuse until ready. */
export function requireReady(_req: Request, res: Response, next: NextFunction): void {
  if (health.isReady()) return next();
  res.setHeader("Retry-After", "5");
  res
    .status(503)
    .json(new ApiReponse(false, null, "Market data is not available yet; the service is starting or stopping", 503));
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json(new ApiReponse(false, null, `Route not found: ${req.method} ${req.path}`, 404));
}

/**
 * Converts errors to the shared `ApiReponse` shape. Only `ApiError` messages
 * are exposed; anything else becomes a generic 500 so database or internal
 * details never leak to clients.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res
      .status(error.statusCode)
      .json(
        new ApiReponse(false, error.errors.length > 0 ? { errors: error.errors } : null, error.message, error.statusCode),
      );
    return;
  }

  // Malformed JSON bodies from express.json()
  if (typeof error === "object" && error !== null && (error as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json(new ApiReponse(false, null, "Malformed JSON body", 400));
    return;
  }

  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled request error");
  res.status(500).json(new ApiReponse(false, null, "Internal server error", 500));
}
