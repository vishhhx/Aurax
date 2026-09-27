export const ENV = {
  MARKETS_A: process.env.MARKETS_A?.split(",") || [],
  MARKETS_B: process.env.MARKETS_B?.split(",") || [],
  S3_REGION: process.env.S3_REGION || "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "",
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || "",
};
