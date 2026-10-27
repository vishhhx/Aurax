import { fromDbDecimal } from "../lib/decimal";
import { prisma } from "@repo/pg";

/** Public market metadata. Decimals are serialised as strings. */
export interface MarketInfo {
  marketId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  tickSize: string;
  stepSize: string;
  minPrice: string;
  maxPrice: string;
  minQuantity: string;
  maxQuantity: string;
  minNotional: string;
  makerFee: string;
  takerFee: string;
  pricePrecision: number;
  quantityPrecision: number;
}

class MarketRepository {
  async listEnabled(symbols?: string[]): Promise<MarketInfo[]> {
    const markets = await prisma.market.findMany({
      where: { isEnabled: true, ...(symbols ? { symbol: { in: symbols } } : {}) },
      include: {
        baseAsset: { select: { symbol: true } },
        quoteAsset: { select: { symbol: true } },
      },
      orderBy: { symbol: "asc" },
    });

    return markets.map((m) => ({
      marketId: m.marketId,
      symbol: m.symbol,
      baseAsset: m.baseAsset.symbol,
      quoteAsset: m.quoteAsset.symbol,
      status: m.status,
      tickSize: fromDbDecimal(m.tickSize),
      stepSize: fromDbDecimal(m.stepSize),
      minPrice: fromDbDecimal(m.minPrice),
      maxPrice: fromDbDecimal(m.maxPrice),
      minQuantity: fromDbDecimal(m.minQuantity),
      maxQuantity: fromDbDecimal(m.maxQuantity),
      minNotional: fromDbDecimal(m.minNotional),
      makerFee: fromDbDecimal(m.makerFee),
      takerFee: fromDbDecimal(m.takerFee),
      pricePrecision: m.pricePrecision,
      quantityPrecision: m.quantityPrecision,
    }));
  }
}

export const marketRepo = new MarketRepository();
