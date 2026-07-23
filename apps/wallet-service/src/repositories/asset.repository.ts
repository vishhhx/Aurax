import { prisma } from "@repo/pg";
export class AssetRepository {
  async getAssetIdBySymbol(symbol: string) {
    return prisma.asset.findFirst({
      where: {
        symbol,
      },
      select: {
        assetId: true,
      },
    });
  }

  async getBySymbol(symbol: string) {
    // ...
  }

  async getAllAssets() {
    // ...
  }
}
