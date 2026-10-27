import { consumer as Consumer, TOPICS } from "@repo/kafka";
import type { Consumer as KafkaConsumer } from "kafkajs";
import type { OrderSide, OrderStatus } from "@repo/pg";

import logger from "../config/logger";
import orderRepository from "../repositories/order.repositorie";

/**
 * Engine execution reports — topic `trade.executed`, key = symbol, so a
 * market's fills and lifecycle events arrive in engine order. Contract:
 * apps/engine/src/types/events.ts.
 */
interface Base {
  eventId: string;
  symbol: string;
  timestamp: number;
}

export interface OrderOpenedEvent extends Base {
  event: "order.opened";
  orderId: string;
  userId: string;
  side: OrderSide;
  price: string;
  executedQuantity: string;
  remainingQuantity: string;
}

export interface OrderRejectedEvent extends Base {
  event: "order.rejected";
  userId: string;
  orderId: string;
  reason: string;
}

export interface OrderCancelledEvent extends Base {
  event: "order.cancelled";
  userId: string;
  orderId: string;
  reason: string;
  executedQuantity: string;
  remainingQuantity: string;
}

interface TradeParty {
  orderId: string;
  userId: string;
  status: OrderStatus;
  side: OrderSide;
  executedQuantity: string;
  remainingQuantity: string;
}

export interface TradeExecutedEvent extends Base {
  event: "trade.executed";
  tradeId: string;
  marketId: string;
  maker: TradeParty;
  taker: TradeParty;
  price: string;
  quantity: string;
}

const DECIMAL = /^\d+(\.\d+)?$/;

function isValid(e: Record<string, unknown>): boolean {
  if (typeof e.symbol !== "string") return false;
  switch (e.event) {
    case "trade.executed": {
      const party = (p: unknown) =>
        !!p && typeof (p as TradeParty).orderId === "string" && typeof (p as TradeParty).userId === "string";
      return (
        typeof e.tradeId === "string" &&
        party(e.maker) &&
        party(e.taker) &&
        typeof e.price === "string" &&
        DECIMAL.test(e.price) &&
        typeof e.quantity === "string" &&
        DECIMAL.test(e.quantity)
      );
    }
    case "order.opened":
    case "order.rejected":
      return typeof e.orderId === "string";
    case "order.cancelled":
      return typeof e.orderId === "string" && typeof e.executedQuantity === "string" && DECIMAL.test(e.executedQuantity);
    default:
      return true; // other event types are ignored
  }
}

export async function handleExecutionReport(raw: Buffer | null): Promise<string> {
  if (!raw) return "empty";
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    logger.warn("Skipping non-JSON execution report");
    return "invalid";
  }
  if (!isValid(event)) {
    logger.warn({ event: event.event, eventId: event.eventId }, "Skipping malformed execution report");
    return "invalid";
  }

  switch (event.event) {
    case "trade.executed":
      return (await orderRepository.executeTrade(event as unknown as TradeExecutedEvent)).result;
    case "order.opened":
      await orderRepository.markOpened(event as unknown as OrderOpenedEvent);
      return "opened";
    case "order.cancelled":
    case "order.rejected":
      return (await orderRepository.closeOrder(event as unknown as OrderCancelledEvent | OrderRejectedEvent)).result;
    default:
      return "ignored"; // e.g. order.cancel_rejected (informational)
  }
}

/**
 * Own consumer group: order-service needs every execution report regardless
 * of what the engine, market-service or gateways consume. Instances of this
 * service share the group (each report is settled by exactly one worker);
 * settlement is idempotent besides.
 */
export const consumeExecutionReports = async (): Promise<KafkaConsumer> => {
  const consumer = Consumer(`${process.env.KAFKA_GROUP_PREFIX ?? "order-service"}.execution-reports`);

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.TRADE_EXECUTED, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message, partition }) => {
      try {
        const result = await handleExecutionReport(message.value);
        logger.debug({ partition, offset: message.offset, result }, "Execution report handled");
      } catch (error) {
        // Not committed: kafkajs retries. Settlement is idempotent.
        logger.error({ err: error, partition, offset: message.offset }, "Execution report failed; retrying");
        throw error;
      }
    },
  });
  logger.info("Execution report consumer started");
  return consumer;
};
