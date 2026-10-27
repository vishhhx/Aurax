import { prisma, Prisma, ReservationStatus, enqueueBalanceUpdates } from "@repo/pg";
import { TOPICS } from "@repo/kafka";

export class ReservationError extends Error {
  constructor(
    readonly code: "INVALID_AMOUNT" | "WALLET_NOT_FOUND" | "INSUFFICIENT_BALANCE" | "DUPLICATE_REFERENCE" | "NOT_FOUND" | "ORDER_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

const WALLET_SCALE = 8;
const AMOUNT = /^\d+(\.\d{1,8})?$/;

class Reserve {
  /**
   * Moves `amount` from available to locked and records the reservation, in
   * one transaction. The debit is a single conditional UPDATE
   * (`availableBalance >= amount`), so concurrent reservations can never
   * spend the same funds; the CHECK constraints are a second line of defence.
   * Idempotent per referenceId: a retry with identical parameters returns the
   * existing reservation.
   */
  async reserveBalance({
    assetSymbol: assetId,
    amount,
    referenceId,
    userId,
  }: {
    assetSymbol: string;
    amount: string;
    referenceId: string;
    userId: string;
  }) {
    if (!AMOUNT.test(amount) || new Prisma.Decimal(amount).lte(0)) {
      throw new ReservationError("INVALID_AMOUNT", `Invalid reservation amount: ${amount}`);
    }
    const value = new Prisma.Decimal(amount).toDecimalPlaces(WALLET_SCALE);

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.balanceReservation.findUnique({ where: { referenceId } });
        if (existing) {
          if (existing.userId === userId && existing.assetId === assetId && existing.amount.eq(value)) return existing;
          throw new ReservationError("DUPLICATE_REFERENCE", `Reference ${referenceId} already used`);
        }

        const debited = await tx.$executeRaw`
          UPDATE "Wallet"
          SET "availableBalance" = "availableBalance" - ${value.toFixed()}::numeric,
              "lockedBalance" = "lockedBalance" + ${value.toFixed()}::numeric,
              "updatedAt" = now()
          WHERE "userId" = ${userId} AND "assetId" = ${assetId}
            AND "availableBalance" >= ${value.toFixed()}::numeric`;

        if (debited !== 1) {
          const wallet = await tx.wallet.findUnique({ where: { userId_assetId: { userId, assetId } }, select: { walletId: true } });
          throw wallet
            ? new ReservationError("INSUFFICIENT_BALANCE", "Insufficient available balance")
            : new ReservationError("WALLET_NOT_FOUND", "Wallet not found");
        }

        const reservation = await tx.balanceReservation.create({
          data: { assetId, amount: value, remainingAmount: value, referenceId, userId },
        });

        await enqueueBalanceUpdates(tx, TOPICS.NOTIFICATION_EVENTS, [{ userId, assetId }], "ORDER_RESERVED", referenceId);
        return reservation;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ReservationError("DUPLICATE_REFERENCE", `Reference ${referenceId} already used`);
      }
      throw error;
    }
  }

  /**
   * Returns an ACTIVE reservation's remaining funds to available balance.
   * Only for reservations no order was created against (order placement
   * compensation); an order's funds are released by settlement/cancellation.
   * Idempotent: releasing an already-released reservation succeeds.
   */
  async releaseBalance(referenceId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { referenceId }, select: { orderId: true } });
      if (order) throw new ReservationError("ORDER_EXISTS", "Reservation belongs to an order");

      await tx.$queryRaw`SELECT 1 FROM "BalanceReservation" WHERE "referenceId" = ${referenceId} FOR UPDATE`;
      const reservation = await tx.balanceReservation.findUnique({ where: { referenceId } });
      if (!reservation) throw new ReservationError("NOT_FOUND", "Reservation not found");
      if (reservation.status !== ReservationStatus.ACTIVE || reservation.remainingAmount.lte(0)) return reservation;

      await tx.wallet.update({
        where: { userId_assetId: { userId: reservation.userId, assetId: reservation.assetId } },
        data: {
          lockedBalance: { decrement: reservation.remainingAmount },
          availableBalance: { increment: reservation.remainingAmount },
        },
      });
      const released = await tx.balanceReservation.update({
        where: { id: reservation.id },
        data: { remainingAmount: 0, status: ReservationStatus.RELEASED },
      });
      await enqueueBalanceUpdates(
        tx,
        TOPICS.NOTIFICATION_EVENTS,
        [{ userId: reservation.userId, assetId: reservation.assetId }],
        "ORDER_RELEASED",
        referenceId,
      );
      return released;
    });
  }
}

export default new Reserve();
