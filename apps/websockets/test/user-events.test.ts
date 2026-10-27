import { describe, expect, test } from "bun:test";
import { mapDepositEvent, mapExecutionReport, mapNotificationEvent, mapOrderEvent } from "../src/private/user-events";

const trade = (makerStatus = "PARTIALLY_FILLED", takerStatus = "FILLED") => ({
  event: "trade.executed",
  eventId: "trade:t-o1-f1",
  tradeId: "t-o1-f1",
  symbol: "BTCUSDC",
  marketId: "m",
  maker: { orderId: "m-order", userId: "alice", status: makerStatus, side: "SELL", executedQuantity: "0.5", remainingQuantity: "0.5" },
  taker: { orderId: "t-order", userId: "bob", status: takerStatus, side: "BUY", executedQuantity: "0.5", remainingQuantity: "0" },
  price: "100",
  quantity: "0.5",
  timestamp: 1234,
});

describe("execution reports → private lifecycle", () => {
  test("a fill gives each party its own trade and an explicit partial/filled status", () => {
    const out = mapExecutionReport(trade());
    expect(out.map((o) => `${o.userId}:${o.message.type}`)).toEqual([
      "alice:trade.executed",
      "alice:order.partially_filled",
      "bob:trade.executed",
      "bob:order.filled",
    ]);
    const alicePartial = out[1]!.message;
    expect(alicePartial.data).toMatchObject({ orderId: "m-order", executedQuantity: "0.5", remainingQuantity: "0.5", status: "PARTIALLY_FILLED" });
    for (const o of out.filter((x) => x.userId === "alice")) {
      expect(JSON.stringify(o)).not.toContain("bob");
      expect(JSON.stringify(o)).not.toContain("t-order");
    }
    // Stable, distinct IDs for client-side dedupe
    expect(new Set(out.map((o) => o.message.eventId)).size).toBe(4);
    expect(mapExecutionReport(trade()).map((o) => o.message.eventId)).toEqual(out.map((o) => o.message.eventId));
  });

  test("a partial fill is never reported as filled", () => {
    const out = mapExecutionReport(trade("PARTIALLY_FILLED", "PARTIALLY_FILLED"));
    expect(out.filter((o) => o.message.type === "order.filled")).toHaveLength(0);
  });

  test("opened, cancelled (with executed quantity), rejected and cancel_rejected reach only the owner", () => {
    const opened = mapExecutionReport({
      event: "order.opened", eventId: "opened:o", orderId: "o", userId: "u", symbol: "BTCUSDC", side: "BUY",
      price: "99", executedQuantity: "0.4", remainingQuantity: "0.6", timestamp: 1,
    });
    expect(opened[0]).toMatchObject({ userId: "u", message: { type: "order.opened", data: { executedQuantity: "0.4" } } });

    const cancelled = mapExecutionReport({
      event: "order.cancelled", eventId: "cancelled:o", orderId: "o", userId: "u", symbol: "BTCUSDC",
      reason: "USER_CANCELLED", executedQuantity: "0.4", remainingQuantity: "0.6", timestamp: 2,
    });
    expect(cancelled[0]!.message).toMatchObject({ type: "order.cancelled", data: { executedQuantity: "0.4", remainingQuantity: "0.6" } });

    for (const event of ["order.rejected", "order.cancel_rejected"]) {
      const [o] = mapExecutionReport({ event, eventId: `${event}:o`, orderId: "o", userId: "u", symbol: "BTCUSDC", reason: "X", timestamp: 3 });
      expect(o).toMatchObject({ userId: "u", message: { type: event } });
    }
  });

  test("order.created becomes order.accepted without internal fields", () => {
    const [o] = mapOrderEvent({
      event: "order.created", eventId: "order.created:o1", orderId: "o1", userId: "alice", symbol: "BTCUSDC", side: "BUY",
      orderType: "LIMIT", quantity: "1", price: "100", timeInForce: "GTC", postOnly: false, status: "PENDING",
      referenceId: "reservation-secret", createdAt: "2026-10-26T00:00:00.000Z",
    });
    expect(o!.message.type).toBe("order.accepted");
    expect(JSON.stringify(o)).not.toContain("reservation-secret");
  });

  test("balance.updated and deposit.completed go to their owner", () => {
    const [b] = mapNotificationEvent({
      event: "balance.updated", eventId: "balance:TRADE:t:u:a", userId: "u", assetId: "a", asset: "USDC",
      available: "10", locked: "2", total: "12", reason: "TRADE", referenceId: "t", version: 5, timestamp: 9,
    });
    expect(b).toMatchObject({ userId: "u", message: { type: "balance.updated", data: { available: "10", locked: "2", total: "12" } } });

    const [d] = mapDepositEvent({ event: "deposit.completed", eventId: "deposit.completed:d1", userId: "u", depositId: "d1", assetId: "a", amount: "5", balance: "15", timestamp: "2026-10-26T00:00:00.000Z" });
    expect(d).toMatchObject({ userId: "u", message: { type: "deposit.completed", eventId: "deposit.completed:d1" } });
  });

  test("malformed or unrelated events produce nothing", () => {
    expect(mapExecutionReport({ ...trade(), maker: undefined })).toEqual([]);
    expect(mapExecutionReport({ event: "orderbook.updated" })).toEqual([]);
    expect(mapOrderEvent({ event: "order.created", userId: "u" })).toEqual([]);
    expect(mapNotificationEvent({ event: "balance.updated", userId: "u" })).toEqual([]);
    expect(mapOrderEvent(null)).toEqual([]);
  });
});
