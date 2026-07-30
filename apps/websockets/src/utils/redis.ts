import { RedisSet } from "@repo/redis";

export class SocketRepository {
  private  readonly redis = new RedisSet();

   async add(userId: string, socketId: string): Promise<void> {
    await this.redis.sAdd(`user:${userId}:sockets`, socketId);
  }

   async remove(userId: string, socketId: string): Promise<void> {
    await this.redis.sRem(`user:${userId}:sockets`, socketId);
  }

   async get(userId: string): Promise<string[]> {
    return this.redis.sMembers(`user:${userId}:sockets`);
  }
}
