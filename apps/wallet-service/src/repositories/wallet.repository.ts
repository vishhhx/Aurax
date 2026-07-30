import { prisma } from "@repo/pg";

export class WalletRepository {
  async getUserWallets(userId: string) {
    return prisma.wallet.findMany({
      where: {
        userId,
      },
    });
  }

  async getWalletByUserAndAsset(userId: string, assetId: string) {
    return prisma.wallet.findUnique({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
    });
  }
}
