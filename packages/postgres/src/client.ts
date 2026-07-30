import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.PG_DATABASE_URL;

if (!connectionString) {
  throw new Error("PG_DATABASE_URL is required to connect to PostgreSQL.");
}

const adapter = new PrismaPg({
  connectionString,
});

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  });

export const connectToPostgres = async () => {
  try {
    await prisma.$connect();
  } catch (error) {
    throw new Error(
      `Failed to connect to Postgress: ${error instanceof Error ? error.message : error}`,
    );
  }
};

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
