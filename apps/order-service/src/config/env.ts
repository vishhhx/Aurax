const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const ENV = {
  PORT: Number(process.env.PORT || 5003),
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  WALLET_GRPC_URL: required("WALLET_GRPC_URL"),
  PG_DATABASE_URL: required("PG_DATABASE_URL"),
  /** Run the transactional-outbox relay in this process (default on). */
  OUTBOX_RELAY: process.env.OUTBOX_RELAY !== "false",
};
