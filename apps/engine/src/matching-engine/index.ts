import { prisma, type Market, type Order } from "@repo/pg";
import { OrderBook } from "../orderbook/orderbook";
class MatchingEngine {
  markets: Market[] = [];
  orderbooks: Map<string, OrderBook> = new Map();
  constructor(private marketsSymbols: string[]) {}
  protected async loadMarkets() {
    this.markets = await prisma.market.findMany({
      where: {
        symbol: {
          in: this.marketsSymbols,
        },
      },
    });
  }

  generateOrderBook() {
    if (this.markets.length === 0) {
      throw new Error("Markets not loaded");
    }
    this.markets.forEach((market) => {
      //todo: generate order book for each market
      console.log(`Generating order book for ${market.symbol}`);
      this.orderbooks.set(market.symbol, new OrderBook(market.symbol));
      const orderbook = this.orderbooks.get(market.symbol);
      orderbook?.setOrderBook([], []); // todo: fetch orders from s3,kafka and set order book
      console.log(`Order book generated for ${market.symbol}`);
    });
    }

  public cunsumeOrder = async (Order: Order) => {
    const orderbook = this.orderbooks.get(Order.symbol);

    if (!orderbook) {
      throw new Error(`Order book not found for ${Order.symbol}`);
    }

    

  };
}

export const engine = new MatchingEngine(
  JSON.parse(process.env.MARKETS || "[]") as string[],
);
