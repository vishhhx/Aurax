export const ENV = {
  PORT: process.env.PORT || 5002,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  ORDER_GRPC_URL: process.env.ORDER_GRPC_URL,
  MARKETS: process.env.MARKETS?.split(",") || [],
};
