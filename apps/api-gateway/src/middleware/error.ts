import { Request, Response, NextFunction } from "express";
import logger from "../config/logger";
import { HttpStatus } from "../utils/httpStatus";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error(err.message);

  return res.status(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
