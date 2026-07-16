// import { asyncHandler, ApiReponse, ApiError } from "@repo/core/rest";
// import { Request, Response } from "express";
// import logger from "../config/logger";
// import { AuthService } from "../services/auth";

// export const register = asyncHandler(async (req: Request, res: Response) => {
//   const { email, password } = req.body;

//   const authService = new AuthService();
//   const existingUser = await authService.checkUserExist(email);

//   if (existingUser) {
//     throw new ApiError(409, "User already exists");
//   }

//   const user = await authService.register(email, password);

//   logger.info(`User registered with email: ${email}`);

//   res
//     .status(201)
//     .json(new ApiReponse(true, user, "User registered successfully", 201));
// });
