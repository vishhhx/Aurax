import { prisma } from "./client";

export interface WalletDiscrepancy {
  userId: string;
  assetId: string;
  kind: "LEDGER_MISMATCH" | "LOCKED_MISMATCH";
  /** available + locked (LEDGER_MISMATCH) or locked (LOCKED_MISMATCH) */
  balance: string;
  /** ledger net (LEDGER_MISMATCH) or sum of ACTIVE reservations (LOCKED_MISMATCH) */
  expected: string;
}

/**
 * Detects drift between the authoritative ledger and the balance projection:
 *
 * 1. For every wallet, available + locked must equal the ledger net
 *    (credits − debits). Reservations move funds between available and
 *    locked without a ledger entry, so they do not affect this invariant.
 * 2. locked must equal the remaining amount of the wallet's ACTIVE
 *    reservations (an orphaned lock or an orphaned reservation breaks it).
 *
 * Pass `userIds` to limit the check (tests); omit for a full scan.
 */
export async function reconcileWallets(userIds?: string[]): Promise<WalletDiscrepancy[]> {
  const filter = userIds && userIds.length > 0 ? userIds : null;

  const ledger = await prisma.$queryRaw<Array<{ userId: string; assetId: string; balance: string; expected: string }>>`
    WITH net AS (
      SELECT "userId", "assetId",
             SUM(CASE WHEN "entryType" = 'CREDIT' THEN "amount" ELSE -"amount" END) AS net
      FROM "Ledger"
      WHERE ${filter}::text[] IS NULL OR "userId" = ANY(${filter}::text[])
      GROUP BY "userId", "assetId"
    )
    SELECT COALESCE(w."userId", n."userId") AS "userId",
           COALESCE(w."assetId", n."assetId") AS "assetId",
           (COALESCE(w."availableBalance", 0) + COALESCE(w."lockedBalance", 0))::text AS balance,
           COALESCE(n.net, 0)::text AS expected
    FROM (SELECT * FROM "Wallet" WHERE ${filter}::text[] IS NULL OR "userId" = ANY(${filter}::text[])) w
    FULL OUTER JOIN net n ON n."userId" = w."userId" AND n."assetId" = w."assetId"
    WHERE COALESCE(w."availableBalance", 0) + COALESCE(w."lockedBalance", 0) <> COALESCE(n.net, 0)`;

  const locked = await prisma.$queryRaw<Array<{ userId: string; assetId: string; balance: string; expected: string }>>`
    WITH active AS (
      SELECT "userId", "assetId", SUM("remainingAmount") AS held
      FROM "BalanceReservation"
      WHERE "status" = 'ACTIVE' AND (${filter}::text[] IS NULL OR "userId" = ANY(${filter}::text[]))
      GROUP BY "userId", "assetId"
    )
    SELECT COALESCE(w."userId", a."userId") AS "userId",
           COALESCE(w."assetId", a."assetId") AS "assetId",
           COALESCE(w."lockedBalance", 0)::text AS balance,
           COALESCE(a.held, 0)::text AS expected
    FROM (SELECT * FROM "Wallet" WHERE ${filter}::text[] IS NULL OR "userId" = ANY(${filter}::text[])) w
    FULL OUTER JOIN active a ON a."userId" = w."userId" AND a."assetId" = w."assetId"
    WHERE COALESCE(w."lockedBalance", 0) <> COALESCE(a.held, 0)`;

  return [
    ...ledger.map((r) => ({ ...r, kind: "LEDGER_MISMATCH" as const })),
    ...locked.map((r) => ({ ...r, kind: "LOCKED_MISMATCH" as const })),
  ];
}
