import { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  (requestHandler: RequestHandler) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await requestHandler(req, res, next);
    } catch (error) {
      next(error);
    }
  };

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string = "Something went wrong",
    public errors: any[] = [],
  ) {
    super(message);

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ApiReponse<T> {
  constructor(
    public success: boolean,
    public data: T,
    public message?: string,
    public statusCode?: number,
  ) {}
}
