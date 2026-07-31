import {
  prisma,
  type Deposit,
  DepositStatus,
  WalletTransactionStatus,
  WalletTransactionType,
  LedgerEntryType,
  LedgerReferenceType,
} from "@repo/pg";
import type { CreateDepositInput } from "../services/db";
import logger from "../config/logger";
import { publishDepositCompletedEvent } from "../producer/deposit.producer";

export class DepositRepository {
  async createDeposit(data: CreateDepositInput): Promise<Deposit> {
    try {
      return await prisma.deposit.create({
        data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to create deposit");
      throw new Error("Failed to create deposit");
    }
  }

  async updateOrderId(depositId: string, orderId: string): Promise<Deposit> {
    try {
      return await prisma.deposit.update({
        where: { depositId },
        data: {
          orderId: orderId,
        },
      });
    } catch (error) {
      logger.error(
        { error, depositId, orderId },
        "Failed to update Razorpay order ID",
      );
      throw new Error("Failed to update deposit order ID");
    }
  }

  async conformPayment({
    orderId,
    paymentId,
    status,
  }: {
    orderId: string;
    paymentId: string;
    status: DepositStatus;
  }): Promise<Deposit> {
    try {
      return await prisma.deposit.update({
        where: {
          orderId: orderId,
        },
        data: {
          paymentId,
          status,
        },
      });
    } catch (error) {
      logger.error(
        { error, orderId, status },
        "Failed to update deposit status",
      );
      throw new Error("Failed to update deposit status");
    }
  }

  async completePayment({ orderId }: { orderId: string }) {
    try {
      return prisma.$transaction(async (tx) => {
        const deposit = await tx.deposit.findUnique({
          where: { orderId },
        });
        if (!deposit) {
          throw new Error("Deposit not found");
        }
        if (deposit.status === "COMPLETED") {
          return deposit;
        }

        const updatedDeposit = await tx.deposit.update({
          where: {
            depositId: deposit.depositId,
          },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        const wallet = await tx.wallet.upsert({
          where: {
            userId_assetId: {
              userId: deposit.userId,
              assetId: deposit.assetId,
            },
          },
          update: {
            availableBalance: {
              increment: deposit.amount,
            },
          },
          create: {
            userId: deposit.userId,
            assetId: deposit.assetId,
            availableBalance: deposit.amount,
            lockedBalance: 0,
          },
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

        await publishDepositCompletedEvent({
          event: "deposit.completed",
          userId: deposit.userId,
          depositId: deposit.depositId,
          assetId: deposit.assetId,
          amount: deposit.amount.toString(),
          balance: wallet.availableBalance.toString(),
          timestamp: new Date().toISOString(),
        });

        return updatedDeposit;
      });
    } catch (error) {
      logger.error({ error, orderId }, "Failed to update deposit status");
      throw new Error("Failed to update deposit status");
    }
  }
}
