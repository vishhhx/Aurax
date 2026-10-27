/**
 * Inbound contracts published by the Matching Engine (`apps/engine/src/types/events.ts`).
 *
 * - `trade.executed` on topic `trade.executed`, key = symbol.
 * - `orderbook.updated` on topic `market.events`, key = symbol. Each event is a
 *   FULL snapshot of every price level; `sequenceNumber` increases by 1 per
 *   publication per symbol (it is not a delta protocol).
 */
import { z } from "zod";
import { DecimalError, normalizeDecimal, toScaled } from "../lib/decimal";

const symbol = z.string().regex(/^[A-Z0-9]{2,20}$/, "invalid symbol");
const side = z.enum(["BUY", "SELL"]);

const positiveDecimal = z.string().transform((value, ctx) => {
  try {
    const normalized = normalizeDecimal(value);
    if (toScaled(normalized) <= 0n) {
      ctx.addIssue({ code: "custom", message: `must be positive: ${value}` });
      return z.NEVER;
    }
    return normalized;
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof DecimalError ? error.message : `invalid decimal: ${value}`,
    });
    return z.NEVER;
  }
});

const party = z.object({
  orderId: z.string().min(1),
  userId: z.string().min(1),
  status: z.string(),
  side,
});

export const tradeExecutedSchema = z.object({
  event: z.literal("trade.executed"),
  tradeId: z.string().min(1).max(128),
  symbol,
  marketId: z.string().optional(),
  maker: party,
  taker: party,
  price: positiveDecimal,
  quantity: positiveDecimal,
  timestamp: z.number().int().nonnegative().max(8.64e15),
});

export type TradeExecutedEvent = z.infer<typeof tradeExecutedSchema>;

const level = z.object({
  price: positiveDecimal,
  quantity: positiveDecimal,
});

export const orderBookUpdatedSchema = z.object({
  event: z.literal("orderbook.updated"),
  symbol,
  sequenceNumber: z.string().regex(/^\d+$/, "sequenceNumber must be an unsigned integer string"),
  bids: z.array(level).max(100_000),
  asks: z.array(level).max(100_000),
  timestamp: z.number().int().nonnegative(),
});

export type OrderBookUpdatedEvent = z.infer<typeof orderBookUpdatedSchema>;

export type ParseResult<T> =
  | { ok: true; event: T }
  | { ok: false; ignored: true }
  | { ok: false; ignored: false; reason: string };

/**
 * Parses a raw Kafka value. Events of other types on a shared topic are
 * `ignored`; anything claiming the expected type but failing validation is
 * reported as malformed.
 */
export function parseEngineEvent<T>(
  raw: Buffer | null,
  eventName: string,
  schema: z.ZodType<T>,
): ParseResult<T> {
  if (!raw || raw.length === 0) {
    return { ok: false, ignored: false, reason: "empty message" };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, ignored: false, reason: "invalid JSON" };
  }

  if (typeof json !== "object" || json === null || (json as { event?: unknown }).event !== eventName) {
    return { ok: false, ignored: true };
  }

  const result = schema.safeParse(json);

  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, ignored: false, reason };
  }

  return { ok: true, event: result.data };
}
