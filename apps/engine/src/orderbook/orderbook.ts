import type { OrderSide } from "@repo/pg";
import type { Order } from "./order";

export class OrderBook {
  constructor(public market: string) {
    this.market = market;
  }
  private asks: Map<string, Order> = new Map();
  private bids: Map<string, Order> = new Map();

  public addOrder(order: Order) {
    if (order.side === "BUY") {
      this.bids.set(order.id, order);
      this.ArrageOrders("BUY");
    } else if (order.side === "SELL") {
      this.asks.set(order.id, order);
      this.ArrageOrders("SELL");
    }
  }

  private ArrageOrders(Side: OrderSide) {
    if (Side === "BUY") {
      const sortedBids = Array.from(this.bids.values()).sort((a, b) =>
        Number(b.price - a.price),
      );
      this.bids = new Map(sortedBids.map((order) => [order.id, order]));
    } else if (Side === "SELL") {
      const sortedAsks = Array.from(this.asks.values()).sort((a, b) =>
        Number(a.price - b.price),
      );
      this.asks = new Map(sortedAsks.map((order) => [order.id, order]));
    }
  }

  public getAllbids(): Order[] | null {
    if (this.bids.size === 0) return null;
    return Array.from(this.bids.values());
  }

  public getAllAsks(): Order[] | null {
    if (this.asks.size === 0) return null;
    return Array.from(this.asks.values());
  }

  public getBestAsk(): Order | null {
    if (this.asks.size === 0) return null;
    const bestAsk = Array.from(this.asks.values())[0];
    if (!bestAsk) return null;
    return bestAsk;
  }

  public getBestBid(): Order | null {
    if (this.bids.size === 0) return null;
    const bestBid = Array.from(this.bids.values())[0];
    if (!bestBid) return null;
    return bestBid;
  }

  public removeOrder(orderId: string, side: OrderSide) {
    if (side === "BUY") {
      this.bids.delete(orderId);
    } else if (side === "SELL") {
      this.asks.delete(orderId);
    }
  }

  public UpdateOrder(order: Order) {
    if (order.side === "BUY") {
      this.bids.set(order.id, order);
      this.ArrageOrders("BUY");
    } else if (order.side === "SELL") {
      this.asks.set(order.id, order);
      this.ArrageOrders("SELL");
    }
  }

  public setOrderBook(asks: Order[], bids: Order[]) {
    this.asks = new Map(asks.map((order) => [order.id, order]));
    this.bids = new Map(bids.map((order) => [order.id, order]));
  }
}
