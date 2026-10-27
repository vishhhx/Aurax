import { prisma, type DepositStatus, type LedgerReferenceType } from "@repo/pg";

/**
 * Read-only user history. Pages are newest first, ordered by (createdAt, id)
 * descending; `before` is the id of the last row of the previous page
 * (keyset pagination, stable while new rows arrive).
 */
export class CursorNotFoundError extends Error {}

const DEPOSIT_SELECT = {
  depositId: true,
  assetId: true,
  amount: true,
  status: true,
  orderId: true,
  paymentId: true,
  createdAt: true,
  completedAt: true,
  asset: { select: { symbol: true } },
} as const;

type DepositRow = {
  depositId: string;
  assetId: string;
  amount: { toFixed(): string };
  status: DepositStatus;
  orderId: string | null;
  paymentId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  asset: { symbol: string };
};

const serializeDeposit = ({ asset, amount, orderId, paymentId, ...d }: DepositRow) => ({
  ...d,
  asset: asset.symbol,
  amount: amount.toFixed(),
  method: "RAZORPAY" as const,
  // Payment-provider references, needed to match support requests.
  providerOrderId: orderId,
  providerPaymentId: paymentId,
});

const olderThan = (idField: string, cursor: { id: string; createdAt: Date }) => ({
  OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, [idField]: { lt: cursor.id } },
  ],
});

export class HistoryRepository {
  async listDeposits(userId: string, filter: { status?: DepositStatus; limit: number; before?: string }) {
    let cursorWhere = {};
    if (filter.before) {
      const c = await prisma.deposit.findFirst({
        where: { depositId: filter.before, userId },
        select: { depositId: true, createdAt: true },
      });
      if (!c) throw new CursorNotFoundError("before: unknown deposit");
      cursorWhere = olderThan("depositId", { id: c.depositId, createdAt: c.createdAt });
    }
    const rows = await prisma.deposit.findMany({
      where: { userId, ...(filter.status ? { status: filter.status } : {}), ...cursorWhere },
      orderBy: [{ createdAt: "desc" }, { depositId: "desc" }],
      take: filter.limit,
      select: DEPOSIT_SELECT,
    });
    return rows.map(serializeDeposit);
  }

  async getDeposit(userId: string, depositId: string) {
    const row = await prisma.deposit.findFirst({ where: { depositId, userId }, select: DEPOSIT_SELECT });
    return row ? serializeDeposit(row) : null;
  }

  async listLedger(
    userId: string,
    filter: { assetId?: string; referenceType?: LedgerReferenceType; limit: number; before?: string },
  ) {
    let cursorWhere = {};
    if (filter.before) {
      const c = await prisma.ledger.findFirst({
        where: { ledgerId: filter.before, userId },
        select: { ledgerId: true, createdAt: true },
      });
      if (!c) throw new CursorNotFoundError("before: unknown ledger entry");
      cursorWhere = olderThan("ledgerId", { id: c.ledgerId, createdAt: c.createdAt });
    }
    const rows = await prisma.ledger.findMany({
      where: {
        userId,
        ...(filter.assetId ? { assetId: filter.assetId } : {}),
        ...(filter.referenceType ? { referenceType: filter.referenceType } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { ledgerId: "desc" }],
      take: filter.limit,
      select: {
        ledgerId: true,
        assetId: true,
        entryType: true,
        amount: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
        asset: { select: { symbol: true } },
      },
    });
    return rows.map(({ asset, amount, ...e }) => ({ ...e, asset: asset.symbol, amount: amount.toFixed() }));
  }
}
