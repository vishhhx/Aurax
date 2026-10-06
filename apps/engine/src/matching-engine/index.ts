import { prisma, type Market, OrderStatus } from "@repo/pg";

import type {
  Fill,
  KafkaPosition,
  Order,
  OrderBookSnapshot,
} from "../orderbook/order";

import { OrderBook, type PriceLevel } from "../orderbook/orderbook";
import { producerRouter } from "../producers/order";
import type { meta } from "../consumers/order.consumer";
import { s3Service } from "../utils/s3";
export enum EngineMode {
  RECOVERY = "RECOVERY",
  LIVE = "LIVE",
}
export class MatchingEngine {
  private markets: Market[] = [];

  private orderbooks: Map<string, OrderBook> = new Map();

  private sequenceNumber = 0;
  private mode: EngineMode = EngineMode.LIVE;
  constructor(private readonly marketsSymbols: string[]) {}

  public async load(): Promise<void> {
    this.markets = await prisma.market.findMany({
      where: {
        symbol: {
          in: this.marketsSymbols,
        },
      },
    });

    this.generateOrderBooks();
  }

  public generateOrderBooks(): void {
    if (this.markets.length === 0) {
      throw new Error("Markets not loaded");
    }

    for (const market of this.markets) {
      const orderBook = new OrderBook(market.symbol);

      orderBook.setOrderBook([], []);

      this.orderbooks.set(market.symbol, orderBook);

      console.log(`Order book generated for ${market.symbol}`);
    }
  }

  public async consumeOrder(order: Order, meta: meta): Promise<void> {
    const orderBook = this.orderbooks.get(order.symbol);

    if (!orderBook) {
      throw new Error(`Order book not found for ${order.symbol}`);
    }

    const engineOrder: Order = {
      ...order,
      sequenceNumber: this.sequenceNumber++,
    };

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
      await this.cancelRemaining(engineOrder);

      await this.handleSnapshot(orderBook, meta);

      return;
    }

    if (engineOrder.timeInForce === "FOK") {
      throw new Error(`FOK order ${engineOrder.id} has remaining quantity`);
    }

    if (engineOrder.type === "LIMIT" && engineOrder.timeInForce === "GTC") {
      orderBook.addOrder(engineOrder);

      await this.publishOrderBook(orderBook);

      // await this.publishStatus(engineOrder);
    }

    await this.handleSnapshot(orderBook, meta);
  }

  private async handleSnapshot(
    orderBook: OrderBook,
    meta: meta,
  ): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) {
      return;
    }

    orderBook.incrementEventCount();

    if (orderBook.getEventCount() < 100) {
      return;
    }

    const snapshot = this.getSnapshot(orderBook, meta);

    await s3Service.uploadFile(snapshot);

    orderBook.resetEventCount();
  }

  private async matchOrder(orderBook: OrderBook, taker: Order): Promise<void> {
    while (taker.remainingQuantity > 0) {
      const maker =
        taker.side === "BUY" ? orderBook.getBestAsk() : orderBook.getBestBid();

      if (!maker) {
        break;
      }

      if (!this.canMatch(taker, maker)) {
        break;
      }

      const quantity =
        taker.remainingQuantity < maker.remainingQuantity
          ? taker.remainingQuantity
          : maker.remainingQuantity;

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
    const tradeId = crypto.randomUUID();

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

    maker.remainingQuantity -= quantity;

    maker.filledQuantity += quantity;

    maker.executedQuantity += quantity;

    maker.fills.push(fill);

    taker.remainingQuantity -= quantity;

    taker.filledQuantity += quantity;

    taker.executedQuantity += quantity;

    taker.fills.push(fill);

    if (maker.remainingQuantity === 0) {
      orderBook.removeOrder(maker.id, maker.side, maker.price);
    } else {
      orderBook.updateOrder(maker);
    }

    if (this.mode === EngineMode.LIVE) {
      await producerRouter({
        event: "trade.executed",

        tradeId,

        symbol: taker.symbol,
        marketId: orderBook.market,

        maker: {
          orderId: maker.id,
          userId: maker.userId,
          status: this.getStatus(maker),
          side: maker.side,
        },

        taker: {
          orderId: taker.id,
          userId: taker.userId,
          status: this.getStatus(taker),
          side: taker.side,
        },

        price: price.toString(),

        quantity: quantity.toString(),

        timestamp,
      });
    }

    // await this.publishStatus(maker);

    // await this.publishStatus(taker);

    await this.publishOrderBook(orderBook);
  }

  private validatePostOnly(orderBook: OrderBook, order: Order): boolean {
    if (order.side === "BUY") {
      const bestAsk = orderBook.getBestAskPrice();

      if (bestAsk === null) {
        return true;
      }

      return order.price < bestAsk;
    }

    const bestBid = orderBook.getBestBidPrice();

    if (bestBid === null) {
      return true;
    }

    return order.price > bestBid;
  }

  private canFullyFill(orderBook: OrderBook, order: Order): boolean {
    let available = 0;

    if (order.side === "BUY") {
      for (const ask of orderBook.getAllAsks()) {
        if (order.type === "LIMIT" && ask.price > order.price) {
          break;
        }

        available += ask.remainingQuantity;

        if (available >= order.remainingQuantity) {
          return true;
        }
      }
    } else {
      for (const bid of orderBook.getAllBids()) {
        if (order.type === "LIMIT" && bid.price < order.price) {
          break;
        }

        available += bid.remainingQuantity;

        if (available >= order.remainingQuantity) {
          return true;
        }
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

  // private async publishStatus(order: Order): Promise<void> {
  //   const status = this.getStatus(order);

  //   await producerRouter({
  //     event:
  //       status === OrderStatus.FILLED || status === OrderStatus.PARTIALLY_FILLED
  //         ? "order.completed"
  //         : "order.cancelled",

  //     userId: order.userId,

  //     orderId: order.id,

  //     symbol: order.symbol,

  //     ...(status === OrderStatus.CANCELLED
  //       ? {
  //           reason: "REMAINING_QUANTITY",
  //         }
  //       : {
  //           status:
  //             status === OrderStatus.FILLED ? "FILLED" : "PARTIALLY_FILLED",
  //         }),
  //   } as any);
  // }

  private async reject(order: Order, reason: string): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) {
      return;
    }

    await producerRouter({
      event: "order.rejected",

      userId: order.userId,

      orderId: order.id,

      symbol: order.symbol,

      reason,
    });
  }

  private async cancelRemaining(order: Order): Promise<void> {
    if (order.remainingQuantity <= 0 || this.mode === EngineMode.RECOVERY) {
      return;
    }

    await producerRouter({
      event: "order.cancelled",

      userId: order.userId,

      orderId: order.id,

      symbol: order.symbol,

      reason: "IOC_REMAINING_QUANTITY",
    });
  }

  private async publishOrderBook(orderBook: OrderBook): Promise<void> {
    if (this.mode === EngineMode.RECOVERY) {
      return;
    }

    const bids = orderBook.getBidLevels();

    const asks = orderBook.getAskLevels();

    await producerRouter({
      event: "orderbook.updated",

      symbol: orderBook.market,

      sequenceNumber: (this.sequenceNumber++).toString(),

      bids: bids.map((level: PriceLevel) => ({
        price: level.price.toString(),

        quantity: level.quantity.toString(),
      })),

      asks: asks.map((level: PriceLevel) => ({
        price: level.price.toString(),

        quantity: level.quantity.toString(),
      })),

      timestamp: Date.now(),
    });
  }

  public getSnapshot(
    orderBook: OrderBook,
    kafka: KafkaPosition,
  ): OrderBookSnapshot {
    return {
      version: 1,

      symbol: orderBook.market,

      sequenceNumber: this.sequenceNumber,

      kafka,

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

  public setMode(mode: EngineMode): void {
    this.mode = mode;
  }

  public getMode(): EngineMode {
    return this.mode;
  }

  public getOrderBook(symbol: string): OrderBook {
    const orderBook = this.orderbooks.get(symbol);

    if (!orderBook) {
      throw new Error(`Order book not found for ${symbol}`);
    }

    return orderBook;
  }

  public restoreSequenceNumber(sequenceNumber: number): void {
    this.sequenceNumber = sequenceNumber;
  }
}

export const engine = new MatchingEngine(
  JSON.parse(process.env.MARKETS ?? "[]") as string[],
);
