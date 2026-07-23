import { prisma, type Deposit } from "@repo/pg";
import type { CreateDepositInput } from "../services/db";

export class DepositRepository {
  async createDeposit(data: CreateDepositInput): Promise<Deposit> {
    return await prisma.deposit.create({ data: { ...data } });
  }
  async updateOrderId(depositId: string, orderId: string) {
    return await prisma.deposit.update({
      where: { depositId },
      data: { txHash: orderId },
    });
  }
}
