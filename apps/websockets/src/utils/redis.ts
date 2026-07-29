import { RedisSet } from "@repo/redis";

export class SocketRepository {
  private static readonly redis = new RedisSet();

  static async add(userId: string, socketId: string): Promise<void> {
    await this.redis.sAdd(`user:${userId}:sockets`, socketId);
  }

  static async remove(userId: string, socketId: string): Promise<void> {
    await this.redis.sRem(`user:${userId}:sockets`, socketId);
  }

  static async get(userId: string): Promise<string[]> {
    return this.redis.sMembers(`user:${userId}:sockets`);
  }
}
