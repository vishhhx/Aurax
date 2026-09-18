import { prisma, type BalanceReservation } from "@repo/pg";

class Reserve {
  async reserveBalance({
    assetSymbol,
    amount,
    referenceId,
    userId,
  }: {
    assetSymbol: string;
    amount: string;
    referenceId: string;
    userId: string;
  }): Promise<BalanceReservation> {
    console.log("Reserving balance:", { assetSymbol, amount, referenceId, userId });
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: {
          userId_assetId: {
            userId,
            assetId: assetSymbol,
          },
        },
      });
      console.log("wallet i was here", wallet);

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const reserveAmount = Number(amount);

      if (wallet.availableBalance.lt(reserveAmount)) {
        throw new Error("Insufficient balance");
      }

      await tx.wallet.update({
        where: {
          userId_assetId: {
            userId,
            assetId: assetSymbol,
          },
        },
        data: {
          availableBalance: {
            decrement: reserveAmount,
          },
          lockedBalance: {
            increment: reserveAmount,
          },
        },
      });

      const reservation = await tx.balanceReservation.create({
        data: {
          assetId: assetSymbol,
          amount: reserveAmount,
          remainingAmount: reserveAmount,
          referenceId,
          userId,
        },
      });

      return reservation;
    });
  }
}

export default new Reserve();
