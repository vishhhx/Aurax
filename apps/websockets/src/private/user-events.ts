import { TOPICS } from "@repo/kafka";
import type { Server } from "socket.io";
import { z } from "zod";

import { ENV } from "../config/env";
import logger from "../config/logger";
import { SupervisedConsumer } from "../kafka/supervised-consumer";
import { metrics } from "../utils/metrics";

/**
 * Private, per-user events. Separate from market-data routing: separate
 * consumers, socket event "user", and rooms `user:<userId>` that a socket
 * joins ONLY from its verified token. Anonymous sockets never join one.
 * Every gateway instance consumes all events (per-instance groups) and emits
 * to its local sockets in the room, so delivery works whichever instance the
 * user is connected to.
 *
 * Sources:
 *   order.events        order.created            → order.accepted
 *   trade.executed      order.opened             → order.opened
 *                       trade.executed (per side)→ trade.executed + order.partially_filled | order.filled
 *                       order.cancelled          → order.cancelled
 *                       order.rejected           → order.rejected
 *                       order.cancel_rejected    → order.cancel_rejected
 *   notification.events balance.updated          → balance.updated
 *   deposit.events      deposit.completed        → deposit.completed
 *
 * Never forwarded: reservation IDs, counterparty user/order IDs, fees.
 * Every message carries `eventId`; delivery is at-least-once, so clients
 * deduplicate by it.
 */

export const userRoom = (userId: string) => `user:${userId}`;

export type UserMessageType =
  | "order.accepted"
  | "order.opened"
  | "order.partially_filled"
  | "order.filled"
  | "order.cancelled"
  | "order.rejected"
  | "order.cancel_rejected"
  | "trade.executed"
  | "balance.updated"
  | "deposit.completed";

export interface UserMessage {
  type: UserMessageType;
  eventId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

type Delivery = { userId: string; message: UserMessage };

const id = z.string().min(1).max(256);
const side = z.enum(["BUY", "SELL"]);
const num = z.union([z.string(), z.number()]).transform(String);

const orderCreated = z.object({
  event: z.literal("order.created"),
  eventId: id.optional(),
  orderId: id,
  userId: id,
  symbol: z.string(),
  side,
  orderType: z.string(),
  quantity: num,
  price: num.nullable().optional(),
  timeInForce: z.string().optional(),
  postOnly: z.boolean().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
});

const orderOpened = z.object({
  event: z.literal("order.opened"),
  eventId: id,
  orderId: id,
  userId: id,
  symbol: z.string(),
  side,
  price: num,
  executedQuantity: num,
  remainingQuantity: num,
  timestamp: z.number(),
});

const orderClosed = z.object({
  event: z.enum(["order.cancelled", "order.rejected", "order.cancel_rejected"]),
  eventId: id.optional(),
  orderId: id,
  userId: id,
  symbol: z.string(),
  reason: z.string(),
  executedQuantity: num.optional(),
  remainingQuantity: num.optional(),
  timestamp: z.number().optional(),
});

const party = z.object({
  orderId: id,
  userId: id,
  status: z.string(),
  side,
  executedQuantity: num.optional(),
  remainingQuantity: num.optional(),
});
const tradeExecuted = z.object({
  event: z.literal("trade.executed"),
  eventId: id.optional(),
  tradeId: id,
  symbol: z.string(),
  maker: party,
  taker: party,
  price: num,
  quantity: num,
  timestamp: z.number(),
});

const balanceUpdated = z.object({
  event: z.literal("balance.updated"),
  eventId: id,
  userId: id,
  assetId: z.string(),
  asset: z.string(),
  available: z.string(),
  locked: z.string(),
  total: z.string(),
  reason: z.string(),
  referenceId: z.string(),
  version: z.number(),
  timestamp: z.number(),
});

const depositCompleted = z.object({
  event: z.literal("deposit.completed"),
  eventId: id.optional(),
  userId: id,
  depositId: id,
  assetId: z.string(),
  amount: z.string(),
  balance: z.string().optional(),
  timestamp: z.string().optional(),
});

function invalid(type: string): [] {
  metrics.inc("ws_user_events_invalid_total", { type });
  return [];
}

/** order.events → order.accepted (to the owner). */
export function mapOrderEvent(json: unknown, now = Date.now()): Delivery[] {
  if ((json as { event?: unknown } | null)?.event !== "order.created") return [];
  const e = orderCreated.safeParse(json);
  if (!e.success) return invalid("order.created");
  const o = e.data;
  return [
    {
      userId: o.userId,
      message: {
        type: "order.accepted",
        eventId: o.eventId ?? `order.created:${o.orderId}`,
        timestamp: now,
        data: {
          orderId: o.orderId,
          symbol: o.symbol,
          side: o.side,
          orderType: o.orderType,
          quantity: o.quantity,
          price: o.price ?? null,
          timeInForce: o.timeInForce ?? null,
          postOnly: o.postOnly ?? false,
          status: o.status ?? "PENDING",
          createdAt: o.createdAt ?? null,
        },
      },
    },
  ];
}

/** trade.executed topic (engine execution reports) → owner messages. */
export function mapExecutionReport(json: unknown, now = Date.now()): Delivery[] {
  const event = (json as { event?: unknown } | null)?.event;

  if (event === "order.opened") {
    const e = orderOpened.safeParse(json);
    if (!e.success) return invalid("order.opened");
    const o = e.data;
    return [
      {
        userId: o.userId,
        message: {
          type: "order.opened",
          eventId: o.eventId,
          timestamp: o.timestamp,
          data: { orderId: o.orderId, symbol: o.symbol, side: o.side, price: o.price, executedQuantity: o.executedQuantity, remainingQuantity: o.remainingQuantity },
        },
      },
    ];
  }

  if (event === "order.cancelled" || event === "order.rejected" || event === "order.cancel_rejected") {
    const e = orderClosed.safeParse(json);
    if (!e.success) return invalid(String(event));
    const o = e.data;
    return [
      {
        userId: o.userId,
        message: {
          type: o.event,
          eventId: o.eventId ?? `${o.event}:${o.orderId}`,
          timestamp: o.timestamp ?? now,
          data: {
            orderId: o.orderId,
            symbol: o.symbol,
            reason: o.reason,
            ...(o.executedQuantity !== undefined ? { executedQuantity: o.executedQuantity } : {}),
            ...(o.remainingQuantity !== undefined ? { remainingQuantity: o.remainingQuantity } : {}),
          },
        },
      },
    ];
  }

  if (event === "trade.executed") {
    const e = tradeExecuted.safeParse(json);
    if (!e.success) return invalid("trade.executed");
    const t = e.data;
    const out: Delivery[] = [];
    for (const [p, liquidity] of [
      [t.maker, "MAKER"],
      [t.taker, "TAKER"],
    ] as const) {
      out.push({
        userId: p.userId,
        message: {
          type: "trade.executed",
          eventId: `trade:${t.tradeId}:${liquidity}`,
          timestamp: t.timestamp,
          data: {
            tradeId: t.tradeId,
            symbol: t.symbol,
            orderId: p.orderId,
            side: p.side,
            liquidity,
            price: t.price,
            quantity: t.quantity,
            orderStatus: p.status,
            executedAt: t.timestamp,
          },
        },
      });
      const filled = p.status === "FILLED";
      out.push({
        userId: p.userId,
        message: {
          type: filled ? "order.filled" : "order.partially_filled",
          eventId: `${filled ? "filled" : "partial"}:${p.orderId}:${t.tradeId}`,
          timestamp: t.timestamp,
          data: {
            orderId: p.orderId,
            symbol: t.symbol,
            side: p.side,
            lastFillPrice: t.price,
            lastFillQuantity: t.quantity,
            executedQuantity: p.executedQuantity ?? null,
            remainingQuantity: p.remainingQuantity ?? null,
            status: p.status,
          },
        },
      });
    }
    return out;
  }

  return [];
}

/** notification.events → balance.updated (owner only; no wallet internals). */
export function mapNotificationEvent(json: unknown): Delivery[] {
  if ((json as { event?: unknown } | null)?.event !== "balance.updated") return [];
  const e = balanceUpdated.safeParse(json);
  if (!e.success) return invalid("balance.updated");
  const b = e.data;
  return [
    {
      userId: b.userId,
      message: {
        type: "balance.updated",
        eventId: b.eventId,
        timestamp: b.timestamp,
        data: {
          assetId: b.assetId,
          asset: b.asset,
          available: b.available,
          locked: b.locked,
          total: b.total,
          reason: b.reason,
          referenceId: b.referenceId,
          version: b.version,
        },
      },
    },
  ];
}

/** deposit.events → deposit.completed (owner only). */
export function mapDepositEvent(json: unknown, now = Date.now()): Delivery[] {
  if ((json as { event?: unknown } | null)?.event !== "deposit.completed") return [];
  const e = depositCompleted.safeParse(json);
  if (!e.success) return invalid("deposit.completed");
  const d = e.data;
  return [
    {
      userId: d.userId,
      message: {
        type: "deposit.completed",
        eventId: d.eventId ?? `deposit.completed:${d.depositId}`,
        timestamp: d.timestamp ? Date.parse(d.timestamp) || now : now,
        data: { depositId: d.depositId, assetId: d.assetId, amount: d.amount, balance: d.balance ?? null },
      },
    },
  ];
}

const consumers: SupervisedConsumer[] = [];

function parse(value: Buffer | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Emits each message to the owner's room (all their sockets on this
 * instance) on socket event "user". The legacy "deposit.completed" socket
 * event is also emitted for existing clients.
 */
export function deliverUserEvents(io: Server, items: Delivery[]): void {
  for (const { userId, message } of items) {
    const room = io.to(userRoom(userId));
    room.emit("user", message);
    if (message.type === "deposit.completed") room.emit("deposit.completed", message.data);
    metrics.inc("ws_user_events_total", { type: message.type });
  }
}

export async function startUserEventConsumers(io: Server): Promise<void> {
  const sources: Array<{ name: string; topic: string; map: (json: unknown) => Delivery[] }> = [
    { name: "user-orders", topic: TOPICS.ORDER_EVENTS, map: mapOrderEvent },
    { name: "user-executions", topic: TOPICS.TRADE_EXECUTED, map: mapExecutionReport },
    { name: "user-balances", topic: TOPICS.NOTIFICATION_EVENTS, map: mapNotificationEvent },
    { name: "user-deposits", topic: TOPICS.DEPOSIT_EVENTS, map: mapDepositEvent },
  ];

  for (const s of sources) {
    consumers.push(
      new SupervisedConsumer({
        name: s.name,
        // Per-instance group: each instance must see every user's events.
        groupId: `${ENV.KAFKA_GROUP_PREFIX}.${s.name}.${ENV.INSTANCE_ID}`,
        topic: s.topic,
        fromBeginning: false,
        ephemeralGroup: true,
        onMessage: async ({ message }) => deliverUserEvents(io, s.map(parse(message.value))),
      }),
    );
  }

  await Promise.all(consumers.map((c) => c.start()));
  logger.info("User event consumers started");
}

export async function stopUserEventConsumers(): Promise<void> {
  await Promise.all(consumers.map((c) => c.stop()));
  consumers.length = 0;
}
