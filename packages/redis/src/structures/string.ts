import type { RedisClientType } from "redis";
import { RedisBase } from "../base";

export class RedisString extends RedisBase {
  constructor(client: RedisClientType) {
    super(client);
  }

  async set(
    key: string,
    value: string | number,
    options?: {
      EX?: number;
      PX?: number;
      NX?: boolean;
      XX?: boolean;
    },
  ) {
    return this.client.set(key, value, options);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async append(key: string, value: string) {
    return this.client.append(key, value);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async decr(key: string) {
    return this.client.decr(key);
  }

  async incrBy(key: string, value: number) {
    return this.client.incrBy(key, value);
  }

  async decrBy(key: string, value: number) {
    return this.client.decrBy(key, value);
  }

  async mGet(keys: string[]) {
    return this.client.mGet(keys);
  }
}
