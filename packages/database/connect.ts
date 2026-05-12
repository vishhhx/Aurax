import mongoose, { type Connection } from "mongoose";

let connection: Connection | null = null;

export async function connectMongoDb(): Promise<Connection> {
  if (connection) {
    return connection;
  }
  console.log("Connecting to MongoDB...");

  if (!process.env.DATABASE_URL) {
    throw new Error("No database connection string provided");
  }

  try {
    await mongoose.connect(process.env.DATABASE_URL);
    connection = mongoose.connection;
    return connection;
  } catch (error) {
    throw new Error(
      `Failed to connect to MongoDB: ${error instanceof Error ? error.message : error}`,
    );
  }
}
