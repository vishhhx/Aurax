import { ZodError } from "zod";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "@repo/core/rest";
import { HttpStatus } from "../utils/httpStatus";
export const validate =
  (schema: any) => (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new ApiError(
            HttpStatus.BAD_REQUEST,
            "Validation failed",
            error.issues || ["Validation failed"],
          ),
        );
      }

      next(error);
    }
  };
