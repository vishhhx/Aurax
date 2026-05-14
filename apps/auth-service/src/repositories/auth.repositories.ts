import { AuthModel } from "@repo/database";

export class AuthRepository {
  async createUser(email: string, passwordHash: string) {
    try {
      const user = await AuthModel.create({ email, passwordHash });
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
