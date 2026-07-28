import { RedisString } from "@repo/redis";

export interface sessionPlayload {
  refreshToken: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
}
export const generateSessionToken = async (playload: sessionPlayload) => {
  const data = JSON.stringify(playload);
  const redisClient = new RedisString();
  await redisClient.set(`session:${playload.refreshToken}`, data, {
    EX: 60 * 60 * 24 * 7,
  });
  return playload.refreshToken;
};

export const getSessionToken = async (
  refreshToken: string,
): Promise<sessionPlayload | null> => {
  const redisClient = new RedisString();
  const data = await redisClient.get(`session:${refreshToken}`);
  if (!data) {
    return null;
  }
  return JSON.parse(data) as sessionPlayload;
};

export const deleteSessionToken = async (refreshToken: string) => {
  const redisClient = new RedisString();
  return redisClient.delete(`session:${refreshToken}`);
};
