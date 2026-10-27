const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const ENV = {
  PORT: Number(process.env.PORT || 5002),
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  RAZORPAY_CLIENT_ID: process.env.RAZORPAY_CLIENT_ID,
  RAZORPAY_CLIENT_SECRET: process.env.RAZORPAY_CLIENT_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  /** gRPC bind address (also the address order-service dials). */
  WALLET_GRPC_URL: required("WALLET_GRPC_URL"),
  /** Indicative INR price of 1 USDC used to size deposits (decimal string). */
  USDC_INR_RATE: process.env.USDC_INR_RATE || "95.72",
  OUTBOX_RELAY: process.env.OUTBOX_RELAY !== "false",
};
