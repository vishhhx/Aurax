import type { OrderSide } from "@repo/pg";
import type { Order } from "./order";

export interface PriceLevel {
  price: number;
  quantity: number;
}

export class OrderBook {
  constructor(public readonly market: string) {}

  private bids: Map<number, Order[]> = new Map();

  private asks: Map<number, Order[]> = new Map();

  private eventCount: number = 0;

  public addOrder(order: Order): void {
    const book = order.side === "BUY" ? this.bids : this.asks;

    const orders = book.get(order.price);

    if (orders) {
      orders.push(order);
      return;
    }

    book.set(order.price, [order]);
  }

  public removeOrder(
    orderId: string,
    side: OrderSide,
    price: number,
  ): Order | null {
    const book = side === "BUY" ? this.bids : this.asks;

    const orders = book.get(price);

    if (!orders) {
      return null;
    }

    const index = orders.findIndex((order) => order.id === orderId);

    if (index === -1) {
      return null;
    }

    const [removed] = orders.splice(index, 1);

    if (orders.length === 0) {
      book.delete(price);
    }

    return removed ?? null;
  }

  public updateOrder(order: Order): void {
    const book = order.side === "BUY" ? this.bids : this.asks;

    const orders = book.get(order.price);

    if (!orders) {
      throw new Error(`Price level not found`);
    }

    const index = orders.findIndex((existing) => existing.id === order.id);

    if (index === -1) {
      throw new Error(`Order not found`);
    }

    orders[index] = order;
  }

  public getBestBidPrice(): number | null {
    if (this.bids.size === 0) {
      return null;
    }

    let best: number | null = null;

    for (const price of this.bids.keys()) {
      if (best === null || price > best) {
        best = price;
      }
    }

    return best;
  }

  public getBestAskPrice(): number | null {
    if (this.asks.size === 0) {
      return null;
    }

    let best: number | null = null;

    for (const price of this.asks.keys()) {
      if (best === null || price < best) {
        best = price;
      }
    }

    return best;
  }

  public getBestBid(): Order | null {
    const price = this.getBestBidPrice();

    if (price === null) {
      return null;
    }

    return this.bids.get(price)?.at(0) ?? null;
  }

  public getBestAsk(): Order | null {
    const price = this.getBestAskPrice();

    if (price === null) {
      return null;
    }

    return this.asks.get(price)?.at(0) ?? null;
  }

  public getAllBids(): Order[] {
    const prices = [...this.bids.keys()].sort((a, b) => {
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    });

    const result: Order[] = [];

    for (const price of prices) {
      result.push(...(this.bids.get(price) ?? []));
    }

    return result;
  }

  public getAllAsks(): Order[] {
    const prices = [...this.asks.keys()].sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    const result: Order[] = [];

    for (const price of prices) {
      result.push(...(this.asks.get(price) ?? []));
    }

    return result;
  }

  public getBidLevels(): PriceLevel[] {
    const prices = [...this.bids.keys()].sort((a, b) => {
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    });

    return prices.map((price) => ({
      price,
      quantity: this.getLevelQuantity(price, "BUY"),
    }));
  }

  public getAskLevels(): PriceLevel[] {
    const prices = [...this.asks.keys()].sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    return prices.map((price) => ({
      price,
      quantity: this.getLevelQuantity(price, "SELL"),
    }));
  }

  private getLevelQuantity(price: number, side: OrderSide): number {
    const book = side === "BUY" ? this.bids : this.asks;

    const orders = book.get(price);

    if (!orders) {
      return 0;
    }

    return orders.reduce((total, order) => total + order.remainingQuantity, 0);
  }

  public setOrderBook(asks: Order[], bids: Order[]): void {
    this.bids.clear();
    this.asks.clear();

    for (const order of bids) {
      this.addOrder(order);
    }

    for (const order of asks) {
      this.addOrder(order);
    }
  }

  public getAllOrders(): Order[] {
    return [...this.getAllBids(), ...this.getAllAsks()];
  }

  public incrementEventCount(): void {
    this.eventCount++;
  }

  public getEventCount(): number {
    return this.eventCount;
  }

  public resetEventCount(): void {
    this.eventCount = 0;
  }
}
