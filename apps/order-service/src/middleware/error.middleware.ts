import type { Request, Response, NextFunction } from "express";
import logger from "../config/logger";
import { HttpStatus } from "../utils/httpStatus";

export const errorMiddleware = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error(err);

  return res.status(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
