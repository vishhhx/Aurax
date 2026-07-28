import { type RedisClientType } from "redis";
import { getRedisClient } from "./connect";

export abstract class RedisBase {
  protected client: RedisClientType;

  constructor() {
    this.client = getRedisClient();
  }

  async delete(key: string) {
    return this.client.del(key);
  }

  async exists(key: string) {
    return this.client.exists(key);
  }

  async expire(key: string, seconds: number) {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string) {
    return this.client.ttl(key);
  }
}
