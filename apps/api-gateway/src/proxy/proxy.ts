import { createProxyMiddleware } from "http-proxy-middleware";
import { ENV } from "../config/env";
import logger from "../config/logger";

export const authProxy = createProxyMiddleware({
  target: ENV.AUTH_SERVICE_URL,
  changeOrigin: true,

  pathRewrite: {
    "^/api/v1/auth": "/auth",
  },

  on: {
    proxyReq(proxyReq, req) {
      logger.info(
        `Forwarding ${req.method} ${req.url} -> ${ENV.AUTH_SERVICE_URL}${req.url}`,
      );
    },

    proxyRes(proxyRes, req) {
      logger.info(
        `Response ${proxyRes.statusCode} <- ${req.method} ${req.url}`,
      );
    },

    error(err, req) {
      logger.error(`Proxy Error ${req.method} ${req.url}: ${err.message}`);
    },
  },
});
