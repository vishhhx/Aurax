import { z, ZodError } from "zod";

import { Request, Response, NextFunction } from "express";
import { ApiError } from "./rest";
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue: any) => ({
          message: `${issue.path.join(".")} is ${issue.message}`,
        }));
        throw new ApiError(
          400,
          `Validation failed: ${JSON.stringify(errorMessages)}`,
        );
      } else {
        throw new ApiError(500, "Internal Server Error");
      }
    }
  };
};
