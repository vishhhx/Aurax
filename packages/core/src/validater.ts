import { z, ZodError } from "zod";

import { Request, Response, NextFunction } from "express";
import { ApiError } from "./rest";
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        }));
        return next(new ApiError(400, "Validation failed", errors));
      } else {
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  };
};
