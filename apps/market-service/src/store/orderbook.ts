import type { PriceLevel } from "../types/orderbook";

export interface OrderBookState {
  symbol: string;
  sequenceNumber: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export class MarketOrderBook {
  private state: OrderBookState;

  constructor(symbol: string) {
    this.state = {
      symbol,
      sequenceNumber: 0,
      bids: [],
      asks: [],
    };
  }

  public initialize(snapshot: OrderBookState): void {
    if (snapshot.symbol !== this.state.symbol) {
      throw new Error("Snapshot symbol mismatch");
    }

    this.state = {
      ...snapshot,
      bids: [...snapshot.bids],
      asks: [...snapshot.asks],
    };
  }

  public update(snapshot: OrderBookState): boolean {
    if (snapshot.symbol !== this.state.symbol) {
      throw new Error("Order book symbol mismatch");
    }

    if (snapshot.sequenceNumber <= this.state.sequenceNumber) {
      return false;
    }

    this.state = {
      ...snapshot,
      bids: [...snapshot.bids],
      asks: [...snapshot.asks],
    };

    return true;
  }

  public getSnapshot(): OrderBookState {
    return {
      ...this.state,
      bids: [...this.state.bids],
      asks: [...this.state.asks],
    };
  }

  public getSequenceNumber(): number {
    return this.state.sequenceNumber;
  }
}

export class MarketOrderBookStore {
  private readonly orderBooks = new Map<string, MarketOrderBook>();

  public get(symbol: string): MarketOrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  public getOrCreate(symbol: string): MarketOrderBook {
    let orderBook = this.orderBooks.get(symbol);

    if (!orderBook) {
      orderBook = new MarketOrderBook(symbol);
      this.orderBooks.set(symbol, orderBook);
    }

    return orderBook;
  }

  public initialize(snapshot: OrderBookState): void {
    this.getOrCreate(snapshot.symbol).initialize(snapshot);
  }

  public update(snapshot: OrderBookState): boolean {
    return this.getOrCreate(snapshot.symbol).update(snapshot);
  }

  public getSnapshot(symbol: string): OrderBookState | undefined {
    return this.orderBooks.get(symbol)?.getSnapshot();
  }

  public getAllSnapshots(): OrderBookState[] {
    return Array.from(this.orderBooks.values(), (orderBook) =>
      orderBook.getSnapshot(),
    );
  }

  public delete(symbol: string): boolean {
    return this.orderBooks.delete(symbol);
  }

  public clear(): void {
    this.orderBooks.clear();
  }
}

export const marketOrderBookStore = new MarketOrderBookStore();
