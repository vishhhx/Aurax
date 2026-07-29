import { RedisBase } from "../base";

export class RedisSet extends RedisBase {
  async sAdd(key: string, ...members: string[]) {
    return this.client.sAdd(key, members);
  }

  async sRem(key: string, ...members: string[]) {
    return this.client.sRem(key, members);
  }

  async sMembers(key: string) {
    return this.client.sMembers(key);
  }

  async sIsMember(key: string, member: string) {
    return this.client.sIsMember(key, member);
  }

}
