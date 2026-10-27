/**
 * Financial integration tests on a REAL Postgres (never the dev DB):
 *   RUN_DB_TESTS=1 PG_DATABASE_URL=postgresql://it:it@localhost:15433/aurax_it bun test test/settlement.db.test.ts
 *
 * Uses the production code paths: wallet-service deposits + reservations,
 * order-service placement (order + outbox command) and settlement. Engine
 * execution reports are constructed exactly as the engine emits them.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("order lifecycle and settlement (Postgres)", async () => {
  const { prisma, reconcileWallets, Prisma } = await import("@repo/pg");
  const orders = (await import("../src/repositories/order.repositorie")).default;
  const { reservationFor, validateOrder } = await import("../src/services/order-rules");
  const reserve = (await import("../../wallet-service/src/repositories/reserve.repository")).default;
  const { DepositRepository } = await import("../../wallet-service/src/repositories/deposit.repository");
  const deposits = new DepositRepository();

  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  const SYMBOL = `T${run}USD`;
  const users = { alice: `alice-${run}`, bob: `bob-${run}`, carol: `carol-${run}` };
  let market: any;
  let base: string;
  let quote: string;

  const wallet = async (userId: string, assetId: string) => {
    const w = await prisma.wallet.findUnique({ where: { userId_assetId: { userId, assetId } } });
    return { available: w?.availableBalance.toFixed() ?? "0", locked: w?.lockedBalance.toFixed() ?? "0" };
  };

  async function fund(userId: string, assetId: string, amount: string) {
    const d = await deposits.createDeposit({ userId, assetId, amount });
    await deposits.updateOrderId(d.depositId, `rzp-${d.depositId}`);
    return deposits.completePayment({ orderId: `rzp-${d.depositId}`, paymentId: `pay-${d.depositId}` });
  }

  /** The order-service placement flow (controller minus HTTP). */
  async function place(userId: string, input: { side: "BUY" | "SELL"; price: string; quantity: string; timeInForce?: "GTC" | "IOC" }) {
    const order = { symbol: SYMBOL, orderType: "LIMIT" as const, postOnly: false, timeInForce: input.timeInForce ?? "GTC", ...input };
    validateOrder(market, order as never);
    const { assetId, amount } = reservationFor(market, order as never);
    const referenceId = crypto.randomUUID();
    await reserve.reserveBalance({ assetSymbol: assetId, amount: amount.toFixed(), referenceId, userId });
    const created = await orders.createOrderWithCommand({ input: order as never, userId, referenceId, marketId: market.marketId });
    return { ...created, referenceId, reserved: amount.toFixed() };
  }

  let fill = 0;
  function trade(maker: { orderId: string; userId: string; side: "BUY" | "SELL" }, taker: { orderId: string; userId: string; side: "BUY" | "SELL" }, price: string, quantity: string, statuses: [string, string]) {
    fill++;
    const tradeId = `${taker.orderId}-f${fill}`;
    return {
      event: "trade.executed" as const,
      eventId: `trade:${tradeId}`,
      tradeId,
      symbol: SYMBOL,
      marketId: market.marketId,
      maker: { ...maker, status: statuses[0], executedQuantity: "0", remainingQuantity: "0" },
      taker: { ...taker, status: statuses[1], executedQuantity: "0", remainingQuantity: "0" },
      price,
      quantity,
      timestamp: Date.now(),
    } as never;
  }

  beforeAll(async () => {
    const baseAsset = await prisma.asset.create({ data: { symbol: `B${run}`, name: "Base", imageUrl: "", decimals: 8, minDeposit: 0, minWithdrawal: 0 } });
    const quoteAsset = await prisma.asset.create({ data: { symbol: `Q${run}`, name: "Quote", imageUrl: "", decimals: 8, minDeposit: 0, minWithdrawal: 0 } });
    base = baseAsset.assetId;
    quote = quoteAsset.assetId;
    market = await prisma.market.create({
      data: {
        symbol: SYMBOL,
        baseAssetId: base,
        quoteAssetId: quote,
        tickSize: "0.01",
        stepSize: "0.0001",
        minPrice: "0.01",
        maxPrice: "1000000",
        minQuantity: "0.0001",
        maxQuantity: "1000",
        minNotional: "1",
        makerFee: "0.001",
        takerFee: "0.002",
        pricePrecision: 2,
        quantityPrecision: 4,
      },
    });
    await fund(users.alice, base, "10");
    await fund(users.bob, quote, "1000");
    await fund(users.carol, quote, "100");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("deposit is credited once; replayed webhook does not double-credit", async () => {
    const before = await wallet(users.carol, quote);
    const d = await deposits.createDeposit({ userId: users.carol, assetId: quote, amount: "5" });
    await deposits.updateOrderId(d.depositId, `rzp-x-${d.depositId}`);
    const first = await deposits.completePayment({ orderId: `rzp-x-${d.depositId}` });
    const second = await deposits.completePayment({ orderId: `rzp-x-${d.depositId}` });
    expect([first.credited, second.credited]).toEqual([true, false]);
    expect((await wallet(users.carol, quote)).available).toBe(new Prisma.Decimal(before.available).add(5).toFixed());

    const outbox = await prisma.outboxEvent.findMany({ where: { key: users.carol } });
    const types = outbox.map((o) => (o.payload as { event: string }).event);
    expect(types.filter((t) => t === "deposit.completed").length).toBe(2); // initial funding + this one
    expect(types).toContain("balance.updated");
  });

  test("Scenario A: resting limit order reserves price × qty + fee and opens", async () => {
    const o = await place(users.carol, { side: "BUY", price: "10", quantity: "1" });
    expect(o.reserved).toBe("10.02"); // 10 × 1 × (1 + max(0.001, 0.002))
    expect(await wallet(users.carol, quote)).toEqual({ available: "94.98", locked: "10.02" });

    const cmd = await prisma.outboxEvent.findFirst({ where: { payload: { path: ["orderId"], equals: o.orderId } } });
    expect(cmd).toMatchObject({ topic: "order.events", key: SYMBOL, payload: expect.objectContaining({ event: "order.created", price: "10", quantity: "1" }) });

    await orders.markOpened({ event: "order.opened", orderId: o.orderId } as never);
    expect((await prisma.order.findUnique({ where: { orderId: o.orderId } }))!.status).toBe("OPEN");
  });

  test("concurrent reservations cannot double-spend", async () => {
    const user = `dave-${run}`;
    await fund(user, quote, "100");
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserve.reserveBalance({ assetSymbol: quote, amount: "30", referenceId: crypto.randomUUID(), userId: user })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    expect(attempts.filter((a) => a.status === "rejected").every((a) => (a as PromiseRejectedResult).reason.code === "INSUFFICIENT_BALANCE")).toBe(true);
    expect(await wallet(user, quote)).toEqual({ available: "10", locked: "90" });
  });

  test("Scenario B: full match settles both sides with fees, exactly once", async () => {
    const sell = await place(users.alice, { side: "SELL", price: "100", quantity: "1" });
    const buy = await place(users.bob, { side: "BUY", price: "100", quantity: "1" }); // reserves 100.2
    const t = trade({ orderId: sell.orderId, userId: users.alice, side: "SELL" }, { orderId: buy.orderId, userId: users.bob, side: "BUY" }, "100", "1", ["FILLED", "FILLED"]);

    expect((await orders.executeTrade(t)).result).toBe("settled");
    expect((await orders.executeTrade(t)).result).toBe("duplicate");

    // Bob (taker) paid 100 + 0.2 fee; Alice (maker) received 100 − 0.1 fee.
    expect(await wallet(users.bob, quote)).toEqual({ available: "899.8", locked: "0" });
    expect(await wallet(users.bob, base)).toEqual({ available: "1", locked: "0" });
    expect(await wallet(users.alice, base)).toEqual({ available: "9", locked: "0" });
    expect(await wallet(users.alice, quote)).toEqual({ available: "99.9", locked: "0" });

    const rows = await prisma.trade.findMany({ where: { executionId: (t as { tradeId: string }).tradeId } });
    expect(rows.map((r) => r.tradeId).sort()).toEqual([`${(t as any).tradeId}-maker`, `${(t as any).tradeId}-taker`]);
    for (const id of [sell.orderId, buy.orderId]) {
      const o = await prisma.order.findUnique({ where: { orderId: id } });
      expect([o!.status, o!.remainingQuantity.toFixed(), o!.executedQuantity.toFixed()]).toEqual(["FILLED", "0", "1"]);
    }
    const res = await prisma.balanceReservation.findMany({ where: { referenceId: { in: [sell.referenceId, buy.referenceId] } } });
    expect(res.every((r) => r.status === "CONSUMED" && r.remainingAmount.eq(0))).toBe(true);
  });

  test("Scenario C: multiple partial fills, price improvement and fee margin released on fill", async () => {
    const buy = await place(users.bob, { side: "BUY", price: "101", quantity: "1" }); // reserves 101 × 1.002 = 101.202
    const before = await wallet(users.bob, quote);
    const statuses: string[] = [];
    for (const [qty, done] of [["0.3", false], ["0.3", false], ["0.4", true]] as const) {
      const sell = await place(users.alice, { side: "SELL", price: "100", quantity: qty });
      await orders.executeTrade(
        trade({ orderId: buy.orderId, userId: users.bob, side: "BUY" }, { orderId: sell.orderId, userId: users.alice, side: "SELL" }, "100", qty, [done ? "FILLED" : "PARTIALLY_FILLED", "FILLED"]),
      );
      const o = await prisma.order.findUnique({ where: { orderId: buy.orderId } });
      statuses.push(`${o!.status}:${o!.executedQuantity.toFixed()}/${o!.remainingQuantity.toFixed()}`);
    }
    expect(statuses).toEqual(["PARTIALLY_FILLED:0.3/0.7", "PARTIALLY_FILLED:0.6/0.4", "FILLED:1/0"]);

    // Bob was the MAKER here: paid 100 + 0.1 maker fee; 101.202 − 100.1 = 1.102 returned.
    expect(await wallet(users.bob, quote)).toEqual({
      available: new Prisma.Decimal(before.available).add("1.102").toFixed(),
      locked: "0",
    });
  });

  test("Scenario D: partial fill then cancel releases only the unfilled reservation", async () => {
    const start = await wallet(users.bob, quote);
    const buy = await place(users.bob, { side: "BUY", price: "50", quantity: "1" }); // reserves 50.1
    const sell = await place(users.alice, { side: "SELL", price: "50", quantity: "0.4" });
    await orders.executeTrade(
      trade({ orderId: buy.orderId, userId: users.bob, side: "BUY" }, { orderId: sell.orderId, userId: users.alice, side: "SELL" }, "50", "0.4", ["PARTIALLY_FILLED", "FILLED"]),
    ); // bob (maker) pays 20 + 0.02

    const cancel = (executedQuantity: string) =>
      orders.closeOrder({ event: "order.cancelled", eventId: `cancelled:${buy.orderId}`, orderId: buy.orderId, userId: users.bob, symbol: SYMBOL, reason: "USER_CANCELLED", executedQuantity, remainingQuantity: "0.6", timestamp: 1 } as never);

    await expect(cancel("0.3")).rejects.toThrow(/reports executed/); // would release too much: retried, not applied
    expect((await cancel("0.4")).result).toBe("closed");
    expect((await cancel("0.4")).result).toBe("duplicate");

    const o = await prisma.order.findUnique({ where: { orderId: buy.orderId } });
    expect([o!.status, o!.executedQuantity.toFixed(), o!.remainingQuantity.toFixed()]).toEqual(["CANCELLED", "0.4", "0.6"]);
    expect(await wallet(users.bob, quote)).toEqual({
      available: new Prisma.Decimal(start.available).sub("20.02").toFixed(),
      locked: "0",
    });
    // A fill can never land on a cancelled order
    await expect(
      orders.executeTrade(trade({ orderId: buy.orderId, userId: users.bob, side: "BUY" }, { orderId: sell.orderId, userId: users.alice, side: "SELL" }, "50", "0.1", ["FILLED", "FILLED"])),
    ).rejects.toThrow();
  });

  test("rejected order releases its whole reservation; compensation release is idempotent", async () => {
    const start = await wallet(users.carol, quote);
    const o = await place(users.carol, { side: "BUY", price: "1", quantity: "2" });
    await orders.closeOrder({ event: "order.rejected", eventId: `rejected:${o.orderId}`, orderId: o.orderId, userId: users.carol, symbol: SYMBOL, reason: "POST_ONLY", timestamp: 1 } as never);
    expect(await wallet(users.carol, quote)).toEqual(start);

    // Placement compensation: reservation without an order
    const ref = crypto.randomUUID();
    await reserve.reserveBalance({ assetSymbol: quote, amount: "3", referenceId: ref, userId: users.carol });
    await reserve.releaseBalance(ref);
    await reserve.releaseBalance(ref);
    expect(await wallet(users.carol, quote)).toEqual(start);
    // ...but an order's reservation cannot be released through that path
    await expect(reserve.releaseBalance(o.referenceId)).rejects.toMatchObject({ code: "ORDER_EXISTS" });
  });

  test("ledger and balances reconcile for every user in this run", async () => {
    const discrepancies = await reconcileWallets(Object.values(users).concat(`dave-${run}`));
    // dave holds 3 ACTIVE reservations by design (no orders) — consistent with his locked balance.
    expect(discrepancies).toEqual([]);
  });

  test("balance.updated events were enqueued in the same transactions (outbox)", async () => {
    const events = await prisma.outboxEvent.findMany({ where: { key: users.bob, topic: "notification.events" } });
    const reasons = new Set(events.map((e) => (e.payload as { reason: string }).reason));
    expect([...reasons].sort()).toEqual(["DEPOSIT", "ORDER_RELEASED", "ORDER_RESERVED", "TRADE"]);
    expect(events.every((e) => (e.payload as { userId: string }).userId === users.bob)).toBe(true);
  });

  test("order, trade and wallet history page with `before` cursors", async () => {
    const { HistoryRepository } = await import("../../wallet-service/src/repositories/history.repository");
    const history = new HistoryRepository();
    const pageAll = async <T>(fetch: (before?: string) => Promise<T[]>, id: (row: T) => string) => {
      const rows: T[] = [];
      let before: string | undefined;
      for (;;) {
        const page = await fetch(before);
        rows.push(...page);
        if (page.length < 2) return rows;
        before = id(page.at(-1)!);
      }
    };
    const ids = <T>(rows: T[], id: (row: T) => string) => rows.map(id);

    const user = users.bob;
    const allOrders = await orders.listOrders(user, { status: "all", limit: 200 });
    const paged = await pageAll((before) => orders.listOrders(user, { status: "all", limit: 2, before }), (o) => o.orderId);
    expect(allOrders.length).toBeGreaterThan(2);
    expect(ids(paged, (o) => o.orderId)).toEqual(ids(allOrders, (o) => o.orderId));

    const allTrades = await orders.listTrades(user, { limit: 200 });
    const pagedTrades = await pageAll((before) => orders.listTrades(user, { limit: 2, before }), (t) => t.tradeId);
    expect(allTrades.length).toBeGreaterThan(2);
    expect(ids(pagedTrades, (t) => t.tradeId)).toEqual(ids(allTrades, (t) => t.tradeId));

    const allLedger = await history.listLedger(user, { limit: 200 });
    const pagedLedger = await pageAll((before) => history.listLedger(user, { limit: 2, before }), (e) => e.ledgerId);
    expect(allLedger.length).toBeGreaterThan(2);
    expect(ids(pagedLedger, (e) => e.ledgerId)).toEqual(ids(allLedger, (e) => e.ledgerId));
    expect(allLedger.every((e) => /^\d+(\.\d+)?$/.test(e.amount))).toBe(true);
    expect(new Set(allLedger.map((e) => e.referenceType))).toEqual(new Set(["DEPOSIT", "TRADE", "FEE"]));

    // Newest first, strictly ordered by (createdAt, id)
    const times = allOrders.map((o) => new Date(o.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    // Another user's id is not a valid cursor
    await expect(orders.listOrders(users.carol, { status: "all", limit: 2, before: allOrders[0]!.orderId })).rejects.toThrow("unknown order");
    await expect(history.listLedger(users.carol, { limit: 2, before: allLedger[0]!.ledgerId })).rejects.toThrow("unknown ledger entry");
  });

  test("deposit history and status lookup are scoped to the owner", async () => {
    const { HistoryRepository } = await import("../../wallet-service/src/repositories/history.repository");
    const history = new HistoryRepository();
    const user = `erin-${run}`;
    const pending = await deposits.createDeposit({ userId: user, assetId: quote, amount: "3" });
    await Bun.sleep(5); // distinct createdAt for a deterministic order
    await fund(user, quote, "7");

    const all = await history.listDeposits(user, { limit: 50 });
    expect(all.map((d) => d.status)).toEqual(["COMPLETED", "PENDING"]);
    expect(all[0]).toMatchObject({ amount: "7", asset: `Q${run}`, method: "RAZORPAY" });
    expect(all[0]!.completedAt).not.toBeNull();
    expect((await history.listDeposits(user, { status: "PENDING", limit: 50 })).map((d) => d.depositId)).toEqual([pending.depositId]);
    const page2 = await history.listDeposits(user, { limit: 1, before: all[0]!.depositId });
    expect(page2.map((d) => d.depositId)).toEqual([pending.depositId]);

    expect(await history.getDeposit(user, pending.depositId)).toMatchObject({ status: "PENDING", amount: "3" });
    expect(await history.getDeposit(users.bob, pending.depositId)).toBeNull();
  });
});
