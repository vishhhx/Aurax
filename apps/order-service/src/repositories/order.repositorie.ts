import {
  prisma,
  OrderSide,
  OrderStatus,
  ReservationStatus,
  Prisma,
  LedgerEntryType,
  LedgerReferenceType,
  WalletTransactionType,
  WalletTransactionStatus,
  enqueueOutbox,
  enqueueBalanceUpdates,
} from "@repo/pg";
import { TOPICS } from "@repo/kafka";

import logger from "../config/logger";
import { dec, toWallet, type Decimal } from "../lib/money";
import type {
  OrderCancelledEvent,
  OrderOpenedEvent,
  OrderRejectedEvent,
  TradeExecutedEvent,
} from "../consumers/order.consumer";
import type { OrderInput } from "../schemas/order.schema";

const ACTIVE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED];
const TERMINAL: OrderStatus[] = [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.EXPIRED];

/**
 * Reservations are rounded up once at placement while each fill's charge is
 * rounded half-up; across many partial fills the sum may exceed the
 * reservation by at most one unit (1e-8) per fill. Shortfalls within this
 * bound are absorbed; anything larger is a real invariant violation.
 */
const DUST_PER_FILL = dec("0.00000001");
const CANCEL_RESEND_MS = 30_000;

type Tx = Prisma.TransactionClient;

export class InvariantError extends Error {}

/** Public order view (no reservation reference). */
const ORDER_SELECT = {
  orderId: true,
  symbol: true,
  side: true,
  orderType: true,
  price: true,
  quantity: true,
  executedQuantity: true,
  remainingQuantity: true,
  averagePrice: true,
  timeInForce: true,
  postOnly: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeOrder(o: Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>) {
  return {
    ...o,
    price: o.price?.toFixed() ?? null,
    quantity: o.quantity.toFixed(),
    executedQuantity: o.executedQuantity.toFixed(),
    remainingQuantity: o.remainingQuantity.toFixed(),
    averagePrice: o.averagePrice?.toFixed() ?? null,
  };
}

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "orderId" = ${orderId} FOR UPDATE`;
  return tx.order.findUnique({ where: { orderId } });
}

async function lockReservation(tx: Tx, referenceId: string) {
  await tx.$queryRaw`SELECT 1 FROM "BalanceReservation" WHERE "referenceId" = ${referenceId} FOR UPDATE`;
  return tx.balanceReservation.findUnique({ where: { referenceId } });
}

/** Returns a reservation's remaining funds to available balance. */
async function releaseReservation(tx: Tx, referenceId: string, finalStatus: ReservationStatus) {
  const reservation = await lockReservation(tx, referenceId);
  if (!reservation || reservation.remainingAmount.lte(0)) {
    if (reservation && reservation.status === ReservationStatus.ACTIVE) {
      await tx.balanceReservation.update({ where: { id: reservation.id }, data: { status: finalStatus } });
    }
    return null;
  }

  await tx.balanceReservation.update({
    where: { id: reservation.id },
    data: { remainingAmount: 0, status: finalStatus },
  });
  await tx.wallet.update({
    where: { userId_assetId: { userId: reservation.userId, assetId: reservation.assetId } },
    data: {
      lockedBalance: { decrement: reservation.remainingAmount },
      availableBalance: { increment: reservation.remainingAmount },
    },
  });
  return { userId: reservation.userId, assetId: reservation.assetId, amount: reservation.remainingAmount };
}

class OrderRepository {
  // ─── Placement ────────────────────────────────────────────────────────

  /**
   * Persists the order and its `order.created` engine command atomically
   * (transactional outbox, key = symbol). The reservation was taken before
   * this call; the caller releases it if this throws.
   */
  async createOrderWithCommand(params: { input: OrderInput; userId: string; referenceId: string; marketId: string }) {
    const { input, userId, referenceId, marketId } = params;
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderType: input.orderType,
          side: input.side,
          price: input.price ?? null,
          quantity: input.quantity,
          remainingQuantity: input.quantity,
          timeInForce: input.timeInForce,
          postOnly: input.postOnly,
          symbol: input.symbol,
          userId,
          referenceId,
          market: { connect: { marketId } },
        },
        select: ORDER_SELECT,
      });

      await enqueueOutbox(tx, [
        {
          topic: TOPICS.ORDER_EVENTS,
          key: order.symbol,
          payload: {
            eventId: `order.created:${order.orderId}`,
            event: "order.created",
            orderId: order.orderId,
            userId,
            symbol: order.symbol,
            side: order.side,
            orderType: order.orderType,
            timeInForce: order.timeInForce,
            price: order.price?.toFixed() ?? null,
            quantity: order.quantity.toFixed(),
            postOnly: order.postOnly,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
          },
        },
      ]);

      return serializeOrder(order);
    });
  }

  /** Enqueues an engine cancel command for an active order owned by `userId`. */
  async requestCancel(userId: string, orderId: string) {
    return prisma.$transaction(async (tx) => {
      // Row lock serialises concurrent cancels of the same order (bot retries, double clicks).
      const locked = await lockOrder(tx, orderId);
      if (!locked || locked.userId !== userId) return { result: "not_found" as const };
      const order = await tx.order.findFirst({ where: { orderId, userId }, select: ORDER_SELECT });
      if (!order) return { result: "not_found" as const };
      if (!ACTIVE.includes(order.status)) return { result: "not_active" as const, order: serializeOrder(order) };

      // Cancels are async: the order stays active until the engine's order.cancelled is settled.
      // A repeat request inside the window is acknowledged without a second engine command; after
      // it, the command is re-sent (the engine dedupes) in case the first was somehow lost.
      if (locked.cancelRequestedAt && Date.now() - locked.cancelRequestedAt.getTime() < CANCEL_RESEND_MS) {
        return { result: "requested" as const, order: serializeOrder(order) };
      }
      await tx.order.update({ where: { orderId }, data: { cancelRequestedAt: new Date() } });

      await enqueueOutbox(tx, [
        {
          topic: TOPICS.ORDER_EVENTS,
          key: order.symbol,
          payload: {
            eventId: `order.cancel_requested:${orderId}`,
            event: "order.cancel_requested",
            orderId,
            userId,
            symbol: order.symbol,
            requestedAt: new Date().toISOString(),
          },
        },
      ]);
      return { result: "requested" as const, order: serializeOrder(order) };
    });
  }

  // ─── History ──────────────────────────────────────────────────────────

  async listOrders(userId: string, filter: { status: "open" | "closed" | "all"; symbol?: string; limit: number; before?: string }) {
    let cursorWhere = {};
    if (filter.before) {
      const c = await prisma.order.findFirst({ where: { orderId: filter.before, userId }, select: { orderId: true, createdAt: true } });
      if (!c) throw new CursorNotFoundError("before: unknown order");
      cursorWhere = { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, orderId: { lt: c.orderId } }] };
    }
    const orders = await prisma.order.findMany({
      where: {
        userId,
        ...(filter.symbol ? { symbol: filter.symbol } : {}),
        ...(filter.status === "open" ? { status: { in: ACTIVE } } : filter.status === "closed" ? { status: { in: TERMINAL } } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { orderId: "desc" }],
      take: filter.limit,
      select: ORDER_SELECT,
    });
    return orders.map(serializeOrder);
  }

  async getOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({ where: { orderId, userId }, select: ORDER_SELECT });
    if (!order) return null;
    const fills = await this.listTrades(userId, { orderId, limit: 500 });
    return { ...serializeOrder(order), fills };
  }

  async listTrades(userId: string, filter: { symbol?: string; orderId?: string; limit: number; before?: string }) {
    let cursorWhere = {};
    if (filter.before) {
      const c = await prisma.trade.findFirst({ where: { tradeId: filter.before, userId }, select: { tradeId: true, createdAt: true } });
      if (!c) throw new CursorNotFoundError("before: unknown trade");
      cursorWhere = { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, tradeId: { lt: c.tradeId } }] };
    }
    const trades = await prisma.trade.findMany({
      where: {
        userId,
        ...(filter.symbol ? { symbol: filter.symbol } : {}),
        ...(filter.orderId ? { orderId: filter.orderId } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { tradeId: "desc" }],
      take: filter.limit,
      select: {
        tradeId: true,
        executionId: true,
        orderId: true,
        symbol: true,
        side: true,
        price: true,
        quantity: true,
        quoteAmount: true,
        fee: true,
        feeAsset: true,
        createdAt: true,
      },
    });
    return trades.map((t) => ({
      ...t,
      liquidity: t.tradeId.endsWith("-maker") ? "MAKER" : "TAKER",
      price: t.price.toFixed(),
      quantity: t.quantity.toFixed(),
      quoteAmount: t.quoteAmount.toFixed(),
      fee: t.fee.toFixed(),
    }));
  }

  // ─── Engine execution reports ─────────────────────────────────────────

  /** order.opened: PENDING → OPEN (a partially filled order keeps PARTIALLY_FILLED). Idempotent. */
  async markOpened(event: OrderOpenedEvent) {
    await prisma.order.updateMany({
      where: { orderId: event.orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.OPEN },
    });
  }

  /**
   * order.cancelled / order.rejected: closes an active order and releases
   * exactly the reservation still held — i.e. the funds for the unfilled
   * quantity (fills already consumed their share). Idempotent: replays of an
   * already-closed order are no-ops.
   */
  async closeOrder(event: OrderCancelledEvent | OrderRejectedEvent) {
    return prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, event.orderId);
      if (!order) {
        logger.warn({ orderId: event.orderId, event: event.event }, "Close event for unknown order; skipped");
        return { result: "unknown" as const };
      }
      if (TERMINAL.includes(order.status)) return { result: "duplicate" as const };

      if (event.event === "order.cancelled" && !order.executedQuantity.eq(dec(event.executedQuantity))) {
        // Fills precede the cancel on the same partition, so this means a fill
        // has not been settled yet: retry instead of releasing too much.
        throw new InvariantError(
          `Cancel for ${order.orderId} reports executed ${event.executedQuantity}, settled ${order.executedQuantity.toFixed()}`,
        );
      }

      const status = event.event === "order.rejected" ? OrderStatus.REJECTED : OrderStatus.CANCELLED;
      await tx.order.update({ where: { orderId: order.orderId }, data: { status } });

      const released = await releaseReservation(
        tx,
        order.referenceId,
        status === OrderStatus.REJECTED ? ReservationStatus.CANCELLED : ReservationStatus.RELEASED,
      );
      if (released) {
        await enqueueBalanceUpdates(tx, TOPICS.NOTIFICATION_EVENTS, [released], "ORDER_RELEASED", order.orderId);
      }
      return { result: "closed" as const, status, released: released?.amount.toFixed() ?? "0" };
    });
  }

  /**
   * Settles one engine execution exactly once.
   *
   * - Idempotent by engine trade ID (`executionId`): a replay is a no-op.
   * - Order quantities/status derive from persisted state, not engine floats.
   * - Payer funds come from the order's reservation; when an order fills, the
   *   reservation's leftover (better fill price, unused fee margin) returns to
   *   available balance.
   * - Fees: buyer pays its fee in quote on top of the cost; seller's fee is
   *   deducted from its quote proceeds (unchanged from the existing model).
   * - Receiving wallets are created if missing.
   * - balance.updated for every touched wallet goes to the outbox in the same
   *   transaction.
   */
  async executeTrade(trade: TradeExecutedEvent) {
    try {
      return await prisma.$transaction(async (tx) => this.settle(tx, trade));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Concurrent duplicate delivery won the race on the Trade primary key.
        return { result: "duplicate" as const };
      }
      throw error;
    }
  }

  private async settle(tx: Tx, trade: TradeExecutedEvent) {
    const existing = await tx.trade.findFirst({ where: { executionId: trade.tradeId }, select: { tradeId: true } });
    if (existing) return { result: "duplicate" as const };

    const market = await tx.market.findUnique({
      where: { symbol: trade.symbol },
      select: { marketId: true, baseAssetId: true, quoteAssetId: true, makerFee: true, takerFee: true },
    });
    if (!market) throw new InvariantError(`Market not found: ${trade.symbol}`);

    const quantity = dec(trade.quantity);
    const price = dec(trade.price);
    if (quantity.lte(0) || price.lte(0)) throw new InvariantError("Invalid trade quantity or price");

    const quote = price.mul(quantity);
    const quote8 = toWallet(quote);

    const parties = [
      { role: "maker" as const, info: trade.maker, feeRate: market.makerFee },
      { role: "taker" as const, info: trade.taker, feeRate: market.takerFee },
    ];

    const touched: Array<{ userId: string; assetId: string }> = [];

    for (const party of parties) {
      const order = await lockOrder(tx, party.info.orderId);
      if (!order) throw new InvariantError(`${party.role} order not found: ${party.info.orderId}`);
      if (!ACTIVE.includes(order.status)) {
        throw new InvariantError(`${party.role} order ${order.orderId} is ${order.status}; cannot apply fill ${trade.tradeId}`);
      }
      if (order.side !== party.info.side) throw new InvariantError(`Side mismatch for ${order.orderId}`);
      if (quantity.gt(order.remainingQuantity)) {
        throw new InvariantError(`Fill ${trade.tradeId} exceeds remaining quantity of ${order.orderId}`);
      }

      // Fee as the change in the order's rounded cumulative fee, not a per-fill rounding: per-fill
      // half-up rounding drifts upward across many partial fills and eventually exceeds a BUY's
      // reservation (sized as round-UP of the order total), wedging this consumer on one fill.
      // Telescoping keeps Σfee = round(Σquote × rate), which the reservation always covers.
      const prior = await tx.trade.aggregate({ where: { orderId: order.orderId }, _sum: { quoteAmount: true }, _count: true });
      const priorQuote = prior._sum.quoteAmount ?? dec(0);
      const fee = toWallet(priorQuote.add(quote).mul(party.feeRate)).sub(toWallet(priorQuote.mul(party.feeRate)));
      const remaining = order.remainingQuantity.sub(quantity);
      const executed = order.executedQuantity.add(quantity);
      const averagePrice = (order.averagePrice ?? dec(0)).mul(order.executedQuantity).add(quote).div(executed);
      const filled = remaining.eq(0);

      await tx.order.update({
        where: { orderId: order.orderId },
        data: {
          remainingQuantity: remaining,
          executedQuantity: executed,
          averagePrice,
          status: filled ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED,
        },
      });

      // Draw the payment from the reservation.
      const reservation = await lockReservation(tx, order.referenceId);
      if (!reservation || reservation.status !== ReservationStatus.ACTIVE) {
        throw new InvariantError(`Active reservation not found for ${order.orderId}`);
      }
      const isBuy = order.side === OrderSide.BUY;
      const payAsset = isBuy ? market.quoteAssetId : market.baseAssetId;
      let used: Decimal = isBuy ? quote8.add(fee) : quantity;
      if (used.gt(reservation.remainingAmount)) {
        const shortfall = used.sub(reservation.remainingAmount);
        // Rounding can drift at most DUST_PER_FILL per fill (orders settled before the telescoping
        // fee above carry that legacy drift), so tolerance scales with the order's fill count.
        if (isBuy && shortfall.lte(DUST_PER_FILL.mul(prior._count + 1))) {
          logger.warn({ orderId: order.orderId, shortfall: shortfall.toFixed() }, "Rounding dust absorbed by reservation");
          used = reservation.remainingAmount;
        } else {
          throw new InvariantError(`Insufficient reservation for ${order.orderId}: need ${used.toFixed()}, have ${reservation.remainingAmount.toFixed()}`);
        }
      }

      const leftover = reservation.remainingAmount.sub(used);
      await tx.balanceReservation.update({
        where: { id: reservation.id },
        data: {
          remainingAmount: filled ? 0 : leftover,
          status: filled ? ReservationStatus.CONSUMED : ReservationStatus.ACTIVE,
        },
      });

      // Payer: locked funds are spent; on fill, any leftover is unlocked.
      await tx.wallet.update({
        where: { userId_assetId: { userId: order.userId, assetId: payAsset } },
        data: {
          lockedBalance: { decrement: filled ? used.add(leftover) : used },
          ...(filled && leftover.gt(0) ? { availableBalance: { increment: leftover } } : {}),
        },
      });

      // Receiver side of the same user.
      const receiveAsset = isBuy ? market.baseAssetId : market.quoteAssetId;
      const receiveAmount = isBuy ? quantity : quote8.sub(fee);
      await tx.wallet.upsert({
        where: { userId_assetId: { userId: order.userId, assetId: receiveAsset } },
        update: { availableBalance: { increment: receiveAmount } },
        create: { userId: order.userId, assetId: receiveAsset, availableBalance: receiveAmount, lockedBalance: 0 },
      });

      await tx.trade.create({
        data: {
          tradeId: `${trade.tradeId}-${party.role}`,
          executionId: trade.tradeId,
          orderId: order.orderId,
          userId: order.userId,
          marketId: market.marketId,
          symbol: trade.symbol,
          side: order.side,
          price,
          quantity,
          quoteAmount: quote,
          fee,
          feeAsset: market.quoteAssetId,
        },
      });

      await tx.ledger.createMany({
        data: [
          {
            userId: order.userId,
            assetId: market.baseAssetId,
            entryType: isBuy ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
            amount: quantity,
            referenceId: trade.tradeId,
            referenceType: LedgerReferenceType.TRADE,
          },
          {
            userId: order.userId,
            assetId: market.quoteAssetId,
            entryType: isBuy ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
            amount: quote8,
            referenceId: trade.tradeId,
            referenceType: LedgerReferenceType.TRADE,
          },
          ...(fee.gt(0)
            ? [
                {
                  userId: order.userId,
                  assetId: market.quoteAssetId,
                  entryType: LedgerEntryType.DEBIT,
                  amount: fee,
                  referenceId: trade.tradeId,
                  referenceType: LedgerReferenceType.FEE,
                },
              ]
            : []),
        ],
      });

      await tx.walletTransaction.create({
        data: {
          userId: order.userId,
          assetId: receiveAsset,
          amount: receiveAmount,
          type: WalletTransactionType.TRADE,
          status: WalletTransactionStatus.SUCCESS,
          referenceId: trade.tradeId,
        },
      });

      touched.push({ userId: order.userId, assetId: payAsset }, { userId: order.userId, assetId: receiveAsset });
    }

    await enqueueBalanceUpdates(tx, TOPICS.NOTIFICATION_EVENTS, touched, "TRADE", trade.tradeId);
    return { result: "settled" as const };
  }
}

/** Keyset cursor (`before=<id>`) that does not name one of the caller's rows. */
export class CursorNotFoundError extends Error {}

export default new OrderRepository();
