import logger from "../config/logger";
import { marketRepo, type MarketInfo } from "../repositories/market";

/**
 * The set of markets this instance serves: `MARKETS` ∩ enabled markets in
 * Postgres. Metadata (status, filters, fees) is refreshed periodically so a
 * status change such as HALTED is visible without a restart. The set of
 * served symbols itself is fixed for the process lifetime.
 */
export class MarketRegistry {
  private markets = new Map<string, MarketInfo>();
  private served: string[] = [];

  async load(configured: string[]): Promise<string[]> {
    const found = await marketRepo.listEnabled(configured);
    const foundSymbols = new Set(found.map((m) => m.symbol));
    const missing = configured.filter((s) => !foundSymbols.has(s));

    if (missing.length > 0) {
      throw new Error(
        `MARKETS lists symbols that are missing or disabled in Postgres: ${missing.join(", ")}`,
      );
    }

    this.markets = new Map(found.map((m) => [m.symbol, m]));
    this.served = configured.slice();
    return this.served;
  }

  async refresh(): Promise<void> {
    try {
      const found = await marketRepo.listEnabled(this.served);
      for (const m of found) this.markets.set(m.symbol, m);
    } catch (error) {
      logger.warn({ err: error }, "Market metadata refresh failed; keeping previous metadata");
    }
  }

  /** Test/bootstrap hook */
  set(markets: MarketInfo[]): void {
    this.markets = new Map(markets.map((m) => [m.symbol, m]));
    this.served = markets.map((m) => m.symbol);
  }

  has(symbol: string): boolean {
    return this.markets.has(symbol);
  }

  get(symbol: string): MarketInfo | undefined {
    return this.markets.get(symbol);
  }

  list(): MarketInfo[] {
    return this.served.flatMap((s) => {
      const m = this.markets.get(s);
      return m ? [m] : [];
    });
  }

  symbols(): string[] {
    return this.served.slice();
  }
}

export const marketRegistry = new MarketRegistry();
