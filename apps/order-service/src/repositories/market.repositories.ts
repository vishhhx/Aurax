import { prisma } from "@repo/pg";

export class MarketRepository {
  async findBySymbol(symbol: string) {
    return prisma.market.findUnique({
      where: {
        symbol,
      },
      select: {
        marketId: true,
        symbol: true,
        baseAssetId: true,
        quoteAssetId: true,
        status: true,
        isEnabled: true,
        tickSize: true,
        stepSize: true,
        minPrice: true,
        maxPrice: true,
        minQuantity: true,
        maxQuantity: true,
        minNotional: true,
        pricePrecision: true,
        quantityPrecision: true,
      },
    });
  }
}

export default new MarketRepository();
