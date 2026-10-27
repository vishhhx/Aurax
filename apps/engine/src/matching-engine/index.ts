import { prisma, type Market, OrderStatus } from "@repo/pg";
import type {
  Fill,
  KafkaPosition,
  Order,
  OrderBookSnapshot,
  OrderCancelRequestedEvent,
} from "../types/order";
import type { ExecutionReport } from "../types/events";
import { OrderBook } from "../orderbook/orderbook";
import { producerRouter } from "../producers/order";
import type { KafkaMessageMeta } from "../types/kafka";
import type { PriceLevel } from "../types/orderbook";
import { s3Service } from "../utils/s3";
import { ENV } from "../config/env";

export enum EngineMode {
  RECOVERY = "RECOVERY",
  LIVE = "LIVE",
}

const RECENT_COMMANDS = 50_000;

/** Insertion-ordered bounded set of command IDs (duplicate-command protection). */
class RecentIds {
  private readonly ids = new Set<string>();
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > RECENT_COMMANDS) {
      const oldest = this.ids.values().next();
      if (!oldest.done) this.ids.delete(oldest.value);
    }
    return true;
  }
  values(): string[] {
    return [...this.ids];
  }
  restore(ids: string[]): void {
    this.ids.clear();
    for (const id of ids.slice(-RECENT_COMMANDS)) this.ids.add(id);
  }
}

interface Precision {
  price: number;
  quantity: number;
}

const format = (value: number, decimals: number) => {
  const s = value.toFixed(decimals);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

export class MatchingEngine {
  private markets: Market[] = [];
  private readonly orderbooks = new Map<string, OrderBook>();
  private readonly orderSequenceNumbers = new Map<string, number>();
  private readonly bookSequenceNumbers = new Map<string, number>();
  private readonly precisions = new Map<string, Precision>();
  private readonly recentCommands = new Map<string, RecentIds>();

  /** Publishing mode for the message being processed (RECOVERY = silent replay). */
  private mode: EngineMode = EngineMode.LIVE;
  /** Readiness reported over gRPC: true once every partition has caught up. */
  private ready = false;

  constructor(private readonly marketsSymbols: string[]) {}

  public async load(): Promise<void> {
    this.markets = await prisma.market.findMany({
      where: {
        symbol: {
          in: this.marketsSymbols,
        },
      },
    });

    const missing = this.marketsSymbols.filter((s) => !this.markets.some((m) => m.symbol === s));
    if (missing.length > 0) {
      throw new Error(`Markets not found in Postgres: ${missing.join(", ")}`);
    }

    for (const m of this.markets) {
      this.precisions.set(m.symbol, { price: m.pricePrecision, quantity: m.quantityPrecision });
    }

    this.generateOrderBooks();
  }

  /** Test hook: configure markets without a database. */
  public configureMarkets(markets: Array<{ symbol: string; marketId?: string; pricePrecision: number; quantityPrecision: number }>): void {
    this.markets = markets.map((m) => ({ marketId: m.marketId ?? m.symbol, symbol: m.symbol }) as unknown as Market);
    for (const m of markets) this.precisions.set(m.symbol, { price: m.pricePrecision, quantity: m.quantityPrecision });
    this.generateOrderBooks();
  }

  public generateOrderBooks(): void {
    if (this.markets.length === 0) {
      throw new Error("Markets not loaded");
    }

    for (const market of this.markets) {
      const symbol = market.symbol;
      const orderBook = new OrderBook(symbol, (v) => this.roundQty(symbol, v));

      orderBook.setOrderBook([], []);

      this.orderbooks.set(symbol, orderBook);
      this.orderSequenceNumbers.set(symbol, 0);
      this.bookSequenceNumbers.set(symbol, 0);
      this.recentCommands.set(symbol, new RecentIds());

      console.log(`Order book generated for ${symbol}`);
    }
  }

  // ─── Precision ────────────────────────────────────────────────────────

  private precision(symbol: string): Precision {
    const p = this.precisions.get(symbol);
    if (!p) throw new Error(`Precision not configured for ${symbol}`);
    return p;
  }

  /** Rounds to the market's quantity precision; removes float residue (0.3 - 0.1). */
  private roundQty(symbol: string, value: number): number {
    return Number(value.toFixed(this.precision(symbol).quantity));
  }

  private fmtQty(symbol: string, value: number): string {
    return format(value, this.precision(symbol).quantity);
  }

  private fmtPrice(symbol: string, value: number): string {
    return format(value, this.precision(symbol).price);
  }

  // ─── Sequences ────────────────────────────────────────────────────────

  private nextOrderSequence(symbol: string): number {
    this.assertMarketExists(symbol);

    const next = (this.orderSequenceNumbers.get(symbol) ?? 0) + 1;
    this.orderSequenceNumbers.set(symbol, next);

    return next;
  }

  private nextBookSequence(symbol: string): number {
    this.assertMarketExists(symbol);

    const next = (this.bookSequenceNumbers.get(symbol) ?? 0) + 1;
    this.bookSequenceNumbers.set(symbol, next);

    return next;
  }

  public getSequenceNumber(symbol: string): number {
    this.assertMarketExists(symbol);
    return this.bookSequenceNumbers.get(symbol) ?? 0;
  }

  public getOrderSequenceNumber(symbol: string): number {
    this.assertMarketExists(symbol);
    return this.orderSequenceNumbers.get(symbol) ?? 0;
  }

  public restoreSequenceNumber(symbol: string, sequenceNumber: number): void {
    this.assertValidSequence(sequenceNumber, "book");
    this.assertMarketExists(symbol);
    this.bookSequenceNumbers.set(symbol, sequenceNumber);
  }

  public restoreOrderSequenceNumber(symbol: string, sequenceNumber: number): void {
    this.assertValidSequence(sequenceNumber, "order");
    this.assertMarketExists(symbol);
    this.orderSequenceNumbers.set(symbol, sequenceNumber);
  }

  public restoreRecentCommands(symbol: string, ids: string[]): void {
    this.assertMarketExists(symbol);
    this.recentCommands.get(symbol)!.restore(ids);
  }

  private assertValidSequence(sequenceNumber: number, type: string): void {
    if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
      throw new Error(`Invalid ${type} sequence number`);
    }
  }

  private assertMarketExists(symbol: string): void {
    if (!this.orderbooks.has(symbol)) {
      throw new Error(`Order book not found for ${symbol}`);
    }
  }

  public hasMarket(symbol: string): boolean {
    return this.orderbooks.has(symbol);
  }

  /** First time this command is seen for the market? (bounded window, persisted in snapshots) */
  private firstSeen(symbol: string, commandId: string): boolean {
    return this.recentCommands.get(symbol)!.add(commandId);
  }

  // ─── Commands ─────────────────────────────────────────────────────────

  public async consumeOrder(order: Order, meta: KafkaMessageMeta): Promise<void> {
    const orderBook = this.orderbooks.get(order.symbol);

    if (!orderBook) {
      throw new Error(`Order book not found for ${order.symbol}`);
    }

    if (!this.firstSeen(order.symbol, `create:${order.id}`)) {
      console.warn(`[Engine] Duplicate order.created ignored: ${order.id}`);
      return;
    }

    const engineOrder: Order = {
      ...order,
      price: Number(this.fmtPrice(order.symbol, order.price)),
      quantity: this.roundQty(order.symbol, order.quantity),
      remainingQuantity: this.roundQty(order.symbol, order.remainingQuantity),
      sequenceNumber: this.nextOrderSequence(order.symbol),
    };

    if (engineOrder.remainingQuantity <= 0) {
      await this.reject(engineOrder, "INVALID_QUANTITY");
      await this.handleSnapshot(orderBook, meta);
      return;
    }

    if (engineOrder.postOnly) {
      if (engineOrder.type === "MARKET") {
        await this.reject(engineOrder, "POST_ONLY_MARKET_ORDER");
        await this.handleSnapshot(orderBook, meta);
        return;
      }

      if (!this.validatePostOnly(orderBook, engineOrder)) {
        await this.reject(engineOrder, "POST_ONLY_WOULD_TAKE_LIQUIDITY");
        await this.handleSnapshot(orderBook, meta);
        return;
      }
    }

    if (engineOrder.timeInForce === "FOK") {
      if (!this.canFullyFill(orderBook, engineOrder)) {
        await this.reject(engineOrder, "FOK_NOT_FULLY_FILLABLE");
        await this.handleSnapshot(orderBook, meta);
        return;
      }
    }

    await this.matchOrder(orderBook, engineOrder);

    if (engineOrder.remainingQuantity === 0) {
      await this.handleSnapshot(orderBook, meta);
      return;
    }

    if (engineOrder.timeInForce === "IOC") {
      await this.cancelRemaining(engineOrder, "IOC_REMAINING_QUANTITY");
      await this.handleSnapshot(orderBook, meta);
      return;
    }

    if (engineOrder.timeInForce === "FOK") {
      throw new Error(`FOK order ${engineOrder.id} has remaining quantity`);
    }

    if (engineOrder.type === "MARKET") {
      // A market order never rests; previously its remainder was silently dropped.
      await this.cancelRemaining(engineOrder, "MARKET_NO_LIQUIDITY");
      await this.handleSnapshot(orderBook, meta);
      return;
    }

    // LIMIT + GTC: rest on the book.
    orderBook.addOrder(engineOrder);
    await this.publish({
      event: "order.opened",
      eventId: `opened:${engineOrder.id}`,
      symbol: engineOrder.symbol,
      orderId: engineOrder.id,
      userId: engineOrder.userId,
      side: engineOrder.side,
      price: this.fmtPrice(engineOrder.symbol, engineOrder.price),
      executedQuantity: this.fmtQty(engineOrder.symbol, engineOrder.executedQuantity),
      remainingQuantity: this.fmtQty(engineOrder.symbol, engineOrder.remainingQuantity),
      timestamp: Date.now(),
    });
    await this.publishOrderBook(orderBook);

    await this.handleSnapshot(orderBook, meta);
  }

  /** User-requested cancellation of a resting order's unfilled remainder. */
  public async cancelOrder(cmd: OrderCancelRequestedEvent, meta: KafkaMessageMeta): Promise<void> {
    const orderBook = this.orderbooks.get(cmd.symbol);
    if (!orderBook) throw new Error(`Order book not found for ${cmd.symbol}`);

    if (!this.firstSeen(cmd.symbol, `cancel:${cmd.orderId}`)) {
      console.warn(`[Engine] Duplicate order.cancel_requested ignored: ${cmd.orderId}`);
      return;
    }

    const order = orderBook.findOrder(cmd.orderId);
    const rejectCancel = (reason: "NOT_OPEN" | "NOT_OWNER") =>
      this.publish({
        event: "order.cancel_rejected",
        eventId: `cancel-rejected:${cmd.orderId}`,
        symbol: cmd.symbol,
        orderId: cmd.orderId,
        userId: cmd.userId,
        reason,
        timestamp: Date.now(),
      });

    if (!order) {
      await rejectCancel("NOT_OPEN");
    } else if (order.userId !== cmd.userId) {
      await rejectCancel("NOT_OWNER");
    } else {
      orderBook.removeOrder(order.id, order.side, order.price);
      await this.cancelRemaining(order, "USER_CANCELLED");
      await this.publishOrderBook(orderBook);
    }

    await this.handleSnapshot(orderBook, meta);
  }

  private async handleSnapshot(orderBook: OrderBook, meta: KafkaMessageMeta): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) {
      return;
    }

    orderBook.incrementEventCount();

    if (orderBook.getEventCount() < ENV.SNAPSHOT_EVERY) {
      return;
    }

    const snapshot = this.getSnapshot(orderBook, meta);

    await s3Service.uploadFile(snapshot);
    orderBook.resetEventCount();
  }

  public getSnapshot(orderBook: OrderBook, kafka: KafkaPosition): OrderBookSnapshot {
    return {
      version: 2,
      symbol: orderBook.market,
      sequenceNumber: this.getSequenceNumber(orderBook.market),
      orderSequenceNumber: this.getOrderSequenceNumber(orderBook.market),
      recentCommandIds: this.recentCommands.get(orderBook.market)?.values() ?? [],
      kafka: { topic: kafka.topic, partition: kafka.partition, offset: kafka.offset },
      orders: orderBook.getAllOrders().map((order) => ({
        id: order.id,
        userId: order.userId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        timeInForce: order.timeInForce,
        price: order.price,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        remainingQuantity: order.remainingQuantity,
        executedQuantity: order.executedQuantity,
        postOnly: order.postOnly,
        timestamp: order.timestamp,
        sequenceNumber: order.sequenceNumber,
        fills: order.fills,
      })),
    };
  }

  // ─── Matching (price-time priority) ───────────────────────────────────

  private async matchOrder(orderBook: OrderBook, taker: Order): Promise<void> {
    while (taker.remainingQuantity > 0) {
      const maker = taker.side === "BUY" ? orderBook.getBestAsk() : orderBook.getBestBid();

      if (!maker || !this.canMatch(taker, maker)) {
        break;
      }

      const quantity = Math.min(taker.remainingQuantity, maker.remainingQuantity);

      await this.executeTrade(orderBook, taker, maker, quantity, maker.price);
    }
  }

  private canMatch(taker: Order, maker: Order): boolean {
    if (taker.type === "MARKET") {
      return true;
    }

    if (taker.side === "BUY") {
      return taker.price >= maker.price;
    }

    return taker.price <= maker.price;
  }

  private async executeTrade(
    orderBook: OrderBook,
    taker: Order,
    maker: Order,
    quantity: number,
    price: number,
  ): Promise<void> {
    const symbol = taker.symbol;
    // Deterministic: the n-th fill of this taker. Identical on replay, so
    // downstream consumers deduplicate recovered executions.
    const tradeId = `${taker.id}-f${taker.fills.length + 1}`;
    const timestamp = Date.now();

    const fill: Fill = {
      tradeId,
      makerOrderId: maker.id,
      makerUserId: maker.userId,
      takerOrderId: taker.id,
      takerUserId: taker.userId,
      quantity,
      price,
      timestamp,
    };

    maker.remainingQuantity = this.roundQty(symbol, maker.remainingQuantity - quantity);
    maker.filledQuantity = this.roundQty(symbol, maker.filledQuantity + quantity);
    maker.executedQuantity = this.roundQty(symbol, maker.executedQuantity + quantity);
    maker.fills.push(fill);

    taker.remainingQuantity = this.roundQty(symbol, taker.remainingQuantity - quantity);
    taker.filledQuantity = this.roundQty(symbol, taker.filledQuantity + quantity);
    taker.executedQuantity = this.roundQty(symbol, taker.executedQuantity + quantity);
    taker.fills.push(fill);

    if (maker.remainingQuantity === 0) {
      orderBook.removeOrder(maker.id, maker.side, maker.price);
    } else {
      orderBook.updateOrder(maker);
    }

    const market = this.markets.find((m) => m.symbol === symbol);

    await this.publish({
      event: "trade.executed",
      eventId: `trade:${tradeId}`,
      tradeId,
      symbol,
      marketId: market?.marketId ?? symbol,
      maker: {
        orderId: maker.id,
        userId: maker.userId,
        status: this.getStatus(maker),
        side: maker.side,
        executedQuantity: this.fmtQty(symbol, maker.executedQuantity),
        remainingQuantity: this.fmtQty(symbol, maker.remainingQuantity),
      },
      taker: {
        orderId: taker.id,
        userId: taker.userId,
        status: this.getStatus(taker),
        side: taker.side,
        executedQuantity: this.fmtQty(symbol, taker.executedQuantity),
        remainingQuantity: this.fmtQty(symbol, taker.remainingQuantity),
      },
      price: this.fmtPrice(symbol, price),
      quantity: this.fmtQty(symbol, quantity),
      timestamp,
    });

    await this.publishOrderBook(orderBook);
  }

  private validatePostOnly(orderBook: OrderBook, order: Order): boolean {
    if (order.side === "BUY") {
      const bestAsk = orderBook.getBestAskPrice();
      return bestAsk === null || order.price < bestAsk;
    }

    const bestBid = orderBook.getBestBidPrice();
    return bestBid === null || order.price > bestBid;
  }

  private canFullyFill(orderBook: OrderBook, order: Order): boolean {
    let available = 0;
    const levels = order.side === "BUY" ? orderBook.getAllAsks() : orderBook.getAllBids();

    for (const resting of levels) {
      if (order.type === "LIMIT") {
        if (order.side === "BUY" && resting.price > order.price) break;
        if (order.side === "SELL" && resting.price < order.price) break;
      }

      available = this.roundQty(order.symbol, available + resting.remainingQuantity);

      if (available >= order.remainingQuantity) {
        return true;
      }
    }

    return false;
  }

  private getStatus(order: Order): OrderStatus {
    if (order.remainingQuantity === 0) {
      return OrderStatus.FILLED;
    }

    if (order.filledQuantity > 0) {
      return OrderStatus.PARTIALLY_FILLED;
    }

    return OrderStatus.PENDING;
  }

  private async publish(event: ExecutionReport): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) return;
    await producerRouter(event);
  }

  private async reject(order: Order, reason: string): Promise<void> {
    await this.publish({
      event: "order.rejected",
      eventId: `rejected:${order.id}`,
      userId: order.userId,
      orderId: order.id,
      symbol: order.symbol,
      reason,
      timestamp: Date.now(),
    });
  }

  private async cancelRemaining(
    order: Order,
    reason: "USER_CANCELLED" | "IOC_REMAINING_QUANTITY" | "MARKET_NO_LIQUIDITY",
  ): Promise<void> {
    if (order.remainingQuantity <= 0) return;

    await this.publish({
      event: "order.cancelled",
      eventId: `cancelled:${order.id}`,
      userId: order.userId,
      orderId: order.id,
      symbol: order.symbol,
      reason,
      executedQuantity: this.fmtQty(order.symbol, order.executedQuantity),
      remainingQuantity: this.fmtQty(order.symbol, order.remainingQuantity),
      timestamp: Date.now(),
    });
  }

  private async publishOrderBook(orderBook: OrderBook): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) {
      return;
    }

    const symbol = orderBook.market;
    const sequenceNumber = this.nextBookSequence(symbol);

    const bids = orderBook.getBidLevels();
    const asks = orderBook.getAskLevels();

    await producerRouter({
      event: "orderbook.updated",
      symbol,
      sequenceNumber: sequenceNumber.toString(),
      bids: bids.map((level: PriceLevel) => ({
        price: this.fmtPrice(symbol, level.price),
        quantity: this.fmtQty(symbol, level.quantity),
      })),
      asks: asks.map((level: PriceLevel) => ({
        price: this.fmtPrice(symbol, level.price),
        quantity: this.fmtQty(symbol, level.quantity),
      })),
      timestamp: Date.now(),
    });
  }

  /** Book levels formatted to market precision (gRPC GetOrderBook). */
  public getFormattedBook(symbol: string) {
    const book = this.getOrderBook(symbol);
    return {
      bids: book.getBidLevels().map((l) => ({ price: this.fmtPrice(symbol, l.price), quantity: this.fmtQty(symbol, l.quantity) })),
      asks: book.getAskLevels().map((l) => ({ price: this.fmtPrice(symbol, l.price), quantity: this.fmtQty(symbol, l.quantity) })),
    };
  }

  public setMode(mode: EngineMode): void {
    this.mode = mode;
  }

  public getMode(): EngineMode {
    return this.mode;
  }

  public setReady(ready: boolean): void {
    this.ready = ready;
  }

  /** Status for gRPC: LIVE only once recovery has caught up. */
  public getEngineStatus(): EngineMode {
    return this.ready ? EngineMode.LIVE : EngineMode.RECOVERY;
  }

  public getOrderBook(symbol: string): OrderBook {
    const orderBook = this.orderbooks.get(symbol);

    if (!orderBook) {
      throw new Error(`Order book not found for ${symbol}`);
    }

    return orderBook;
  }
}

export const engine = new MatchingEngine(
  (process.env.MARKETS ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean),
);
