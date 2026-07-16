import { AuthModel } from "@repo/database";
import { AuthPayload } from "../types/auth";

export class AuthRepository {
  async createUser(data: AuthPayload) {
    try {
      const user = await AuthModel.create({
        email: data.email,
        passwordHash: data.password,
        provider: data.provider,
        name: data.name,
        lastLogin: new Date(),
      });
      return user;
    } catch (error) {
      throw new Error("Error creating user");
    }
  }
  async findUserByEmail(email: string) {
    try {
      const user = await AuthModel.findOne({ email });
      return user;
    } catch (error) {
      throw new Error("Error finding user");
    }
  }
}
