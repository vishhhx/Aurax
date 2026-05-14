// services/auth.service.ts

import { AuthRepository } from "../repositories/auth.repositories";
import { comparePassword, hashPassword } from "../utils/password";
import { ApiError } from "@repo/core/rest";
import { type IAuth } from "@repo/database";

export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  async register(email: string, password: string) {
    const existingUser = await this.authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new ApiError(409, "User already exists");
    }

    const passwordHash = await hashPassword(password);

    const user = await this.authRepository.createUser(email, passwordHash);

    return user;
  }

  async login(email: string, password: string) {
    const user: IAuth | null = await this.authRepository.findUserByEmail(email);

    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }

    if (!user.isEmailVerified) {
      throw new ApiError(403, "Email not verified");
    }

    return user;
  }
}
