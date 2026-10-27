import {
  prisma,
  type Deposit,
  DepositStatus,
  LedgerEntryType,
  LedgerReferenceType,
  WalletTransactionStatus,
  WalletTransactionType,
  enqueueBalanceUpdates,
  enqueueOutbox,
} from "@repo/pg";
import { TOPICS } from "@repo/kafka";
import type { CreateDepositInput } from "../services/db";
import logger from "../config/logger";

export class DepositRepository {
  async createDeposit(data: CreateDepositInput): Promise<Deposit> {
    return prisma.deposit.create({ data });
  }

  async updateOrderId(depositId: string, orderId: string): Promise<Deposit> {
    return prisma.deposit.update({ where: { depositId }, data: { orderId } });
  }

  /**
   * Client-side confirmation (signature verified by the caller): PENDING →
   * CONFIRMING only. Never moves a COMPLETED/FAILED deposit backwards.
   */
  async conformPayment({ orderId, paymentId, userId }: { orderId: string; paymentId: string; userId: string }) {
    const updated = await prisma.deposit.updateMany({
      where: { orderId, userId, status: DepositStatus.PENDING },
      data: { paymentId, status: DepositStatus.CONFIRMING },
    });
    const deposit = await prisma.deposit.findFirst({ where: { orderId, userId } });
    return { deposit, transitioned: updated.count === 1 };
  }

  /**
   * Credits a captured payment exactly once.
   *
   * The status transition to COMPLETED is a conditional update inside the
   * transaction, so concurrent or replayed webhooks credit at most once. The
   * wallet credit, ledger entry and the `deposit.completed` +
   * `balance.updated` notifications commit together (outbox); nothing is
   * published for an uncommitted credit.
   */
  async completePayment({ orderId, paymentId }: { orderId: string; paymentId?: string }) {
    return prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { orderId } });
      if (!deposit) throw new Error(`Deposit not found for order ${orderId}`);

      const claimed = await tx.deposit.updateMany({
        where: { depositId: deposit.depositId, status: { in: [DepositStatus.PENDING, DepositStatus.CONFIRMING] } },
        data: { status: DepositStatus.COMPLETED, completedAt: new Date(), ...(paymentId ? { paymentId } : {}) },
      });
      if (claimed.count === 0) {
        logger.info({ depositId: deposit.depositId, status: deposit.status }, "Deposit already finalised; no credit");
        return { deposit, credited: false };
      }

      const wallet = await tx.wallet.upsert({
        where: { userId_assetId: { userId: deposit.userId, assetId: deposit.assetId } },
        update: { availableBalance: { increment: deposit.amount } },
        create: { userId: deposit.userId, assetId: deposit.assetId, availableBalance: deposit.amount, lockedBalance: 0 },
      });

      await tx.ledger.create({
        data: {
          userId: deposit.userId,
          assetId: deposit.assetId,
          entryType: LedgerEntryType.CREDIT,
          amount: deposit.amount,
          referenceId: deposit.depositId,
          referenceType: LedgerReferenceType.DEPOSIT,
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: deposit.userId,
          assetId: deposit.assetId,
          amount: deposit.amount,
          type: WalletTransactionType.DEPOSIT,
          status: WalletTransactionStatus.SUCCESS,
          referenceId: deposit.depositId,
        },
      });

      await enqueueOutbox(tx, [
        {
          topic: TOPICS.DEPOSIT_EVENTS,
          key: deposit.userId,
          payload: {
            eventId: `deposit.completed:${deposit.depositId}`,
            event: "deposit.completed",
            userId: deposit.userId,
            depositId: deposit.depositId,
            assetId: deposit.assetId,
            amount: deposit.amount.toFixed(),
            balance: wallet.availableBalance.toFixed(),
            timestamp: new Date().toISOString(),
          },
        },
      ]);
      await enqueueBalanceUpdates(
        tx,
        TOPICS.NOTIFICATION_EVENTS,
        [{ userId: deposit.userId, assetId: deposit.assetId }],
        "DEPOSIT",
        deposit.depositId,
      );

      return { deposit: { ...deposit, status: DepositStatus.COMPLETED }, credited: true };
    });
  }
}
