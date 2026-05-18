import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

export const connectToredis = async () => {
  if (client) return client;
  try {
    client = createClient({
      socket: {
        host: "localhost",
        port: 6379,
      },
    });

    client.on("error", (err) => {
      console.log("Redis Client Error", err);
    });
    await client.connect();
    return client;
  } catch (error) {
    console.error("Error connecting to Redis:", error);
    throw new Error("Failed to connect to Redis");
  }
};
