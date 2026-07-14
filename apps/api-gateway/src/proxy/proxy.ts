import { createProxyMiddleware } from "http-proxy-middleware";
import { ENV } from "../config/env";

export const authProxy = createProxyMiddleware({
  target: ENV.AUTH_SERVICE_URL,
  changeOrigin: true,
});
