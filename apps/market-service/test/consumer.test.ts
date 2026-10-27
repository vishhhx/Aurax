import { describe, expect, test } from "bun:test";
import { processMessage } from "../src/consumers/runner";
import { InvalidEventError } from "../src/lib/errors";
import { orderBookUpdatedSchema, tradeExecutedSchema } from "../src/types/engine-events";
import { engineTrade } from "./helpers";

const msg = (value: unknown, offset = "7") => ({
  value: value === null ? null : Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),
  offset,
});

function tradeSpec(handle: (e: unknown) => Promise<unknown> = async () => undefined) {
  const seen: unknown[] = [];
  return {
    seen,
    spec: {
      topic: "trade.executed",
      eventName: "trade.executed",
      schema: tradeExecutedSchema,
      handle: async (e: unknown) => {
        seen.push(e);
        return handle(e);
      },
    },
  };
}

describe("consumer message handling", () => {
  test("valid engine trades are parsed and normalised", async () => {
    const { spec, seen } = tradeSpec();
    expect(await processMessage(spec, msg(engineTrade({ quantity: "1e-7" })), 0)).toBe("processed");
    expect((seen[0] as { quantity: string }).quantity).toBe("0.0000001");
  });

  test("malformed messages are skipped, never retried", async () => {
    const { spec, seen } = tradeSpec();
    for (const bad of [
      null,
      "{not json",
      { ...engineTrade(), price: "-1" },
      { ...engineTrade(), quantity: "0" },
      { ...engineTrade(), symbol: "btc/usdc" },
      { ...engineTrade(), taker: undefined },
      { ...engineTrade(), timestamp: "yesterday" },
    ]) {
      expect(await processMessage(spec, msg(bad), 0)).toBe("invalid");
    }
    expect(seen).toHaveLength(0);
  });

  test("other event types on a shared topic are ignored", async () => {
    const seen: unknown[] = [];
    const spec = {
      topic: "market.events",
      eventName: "orderbook.updated",
      schema: orderBookUpdatedSchema,
      handle: async (e: unknown) => void seen.push(e),
    };
    expect(await processMessage(spec, msg({ event: "market.depth", symbol: "BTCUSDC" }), 0)).toBe("ignored");
    expect(seen).toHaveLength(0);
  });

  test("InvalidEventError from the handler is skipped", async () => {
    const { spec } = tradeSpec(async () => {
      throw new InvalidEventError("crossed book");
    });
    expect(await processMessage(spec, msg(engineTrade()), 0)).toBe("invalid");
  });

  test("transient handler errors are rethrown so Kafka retries without committing", async () => {
    const { spec } = tradeSpec(async () => {
      throw new Error("postgres unavailable");
    });
    await expect(processMessage(spec, msg(engineTrade()), 0)).rejects.toThrow("postgres unavailable");
  });

  test("handler receives the Kafka offset as bigint", async () => {
    let offset: bigint | undefined;
    const spec = {
      topic: "market.events",
      eventName: "orderbook.updated",
      schema: orderBookUpdatedSchema,
      handle: async (_e: unknown, ctx: { offset: bigint }) => {
        offset = ctx.offset;
      },
    };
    const event = { event: "orderbook.updated", symbol: "BTCUSDC", sequenceNumber: "3", bids: [], asks: [], timestamp: 1 };
    await processMessage(spec, msg(event, "9007199254740993"), 0);
    expect(offset).toBe(9007199254740993n);
  });
});
