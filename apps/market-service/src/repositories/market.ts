import { prisma, type Market } from "@repo/pg";
import logger from "../config/logger";

class marketRepository {
  async listmarkets(): Promise<Market[]> {
    try {
      return await prisma.market.findMany({
        where: {
          isEnabled: true,
        },
      });
    } catch (error) {
      logger.error({ error }, "Failed to list markets");
      throw new Error("Failed to list markets");
    }
  }

  async getMarketBySymbol(symbol: string): Promise<Market | null> {
    try {
      return await prisma.market.findUnique({
        where: {
          symbol,
        },
      });
    } catch (error) {
      logger.error({ error }, `Failed to get market by symbol: ${symbol}`);
      throw new Error(`Failed to get market by symbol: ${symbol}`);
    }
  }


}



export const marketRepo = new marketRepository();