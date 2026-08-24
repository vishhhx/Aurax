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

  async getAssetById(symbol: string) {
    return prisma.asset.findFirst({
      where: {
        symbol,
      },
    });
  }

  async getAllAssets() {
    return prisma.asset.findMany();
  }
}
