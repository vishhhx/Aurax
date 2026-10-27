import logger from "../config/logger";
import { matchingEngine } from "../grpc/orderbook";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits until the matching engine reports LIVE (it only serves order books in
 * LIVE mode). Backs off from 1s to 10s. `timeoutMs = 0` waits indefinitely;
 * `signal` aborts the wait during shutdown.
 */
export async function waitForEngineReady(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  const started = Date.now();
  let delay = 1_000;

  while (!signal?.aborted) {
    try {
      const status = await matchingEngine.getEngineStatus();
      if (status.isReady) {
        logger.info({ status: status.status }, "Matching engine is ready");
        return;
      }
      logger.info({ status: status.status, errorCode: status.errorCode }, "Matching engine not ready yet");
    } catch (error) {
      logger.warn({ err: error }, "Matching engine status check failed");
    }

    if (timeoutMs > 0 && Date.now() - started >= timeoutMs) {
      throw new Error(`Matching engine was not ready within ${timeoutMs}ms`);
    }

    await sleep(delay);
    delay = Math.min(delay * 2, 10_000);
  }

  throw new Error("Aborted while waiting for the matching engine");
}
