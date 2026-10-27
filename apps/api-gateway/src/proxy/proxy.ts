import type { IncomingMessage, ServerResponse } from "node:http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ENV } from "../config/env";
import logger from "../config/logger";

/**
 * Express strips the mount path (`/api/v1/<service>`) before the proxy sees
 * the request, so `/api/v1/order/abc` reaches order-service as `/abc`.
 * Upstream failures always produce a JSON 502/504 (previously the error
 * handler only logged and the client request hung).
 */
// Query strings can carry credentials (e.g. the OAuth callback `code`): log the path only.
const pathOf = (url?: string) => (url ?? "").split("?")[0];

function serviceProxy(name: string, target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: ENV.UPSTREAM_TIMEOUT_MS,
    timeout: ENV.UPSTREAM_TIMEOUT_MS,
    on: {
      proxyRes(proxyRes, req) {
        logger.info({ service: name, method: req.method, url: pathOf(req.url), status: proxyRes.statusCode }, "Proxied request");
      },
      error(err, req, res) {
        const timedOut = /timeout|ETIMEDOUT|socket hang up/i.test(err.message);
        logger.error({ service: name, method: req.method, url: pathOf(req.url), err: err.message }, "Upstream request failed");
        const response = res as ServerResponse<IncomingMessage>;
        if (typeof response.writeHead === "function" && !response.headersSent) {
          response.writeHead(timedOut ? 504 : 502, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              success: false,
              data: null,
              message: timedOut ? `${name} service timed out` : `${name} service unavailable`,
            }),
          );
        }
      },
    },
  });
}

export const authProxy = serviceProxy("auth", ENV.AUTH_SERVICE_URL);
export const walletProxy = serviceProxy("wallet", ENV.WALLET_SERVICE_URL);
export const orderProxy = serviceProxy("order", ENV.ORDER_SERVICE_URL);
export const marketProxy = serviceProxy("market", ENV.MARKET_SERVICE_URL);
