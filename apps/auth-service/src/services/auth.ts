import { AuthRepository } from "../repositories/auth.repositories";
import { comparePassword, hashPassword } from "../utils/password";
import { ApiError } from "@repo/core/rest";
import { type IAuth } from "@repo/database";
import { AuthPayload } from "../types/auth";

export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  async register(data: AuthPayload): Promise<IAuth> {
    let user;
    if (data.provider === "local" && data.password) {
      const passwordHash = await hashPassword(data.password);

      await this.authRepository.createUser({
        ...data,
        password: passwordHash,
      });
    }

    user = await this.authRepository.createUser({
      ...data,
    });

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

  async checkUserExist(email: string) {
    return await this.authRepository.findUserByEmail(email);
  }
}
