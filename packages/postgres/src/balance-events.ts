import type { Prisma } from "../generated/prisma/client";
import { enqueueOutbox } from "./outbox";

export type BalanceChangeReason =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "ORDER_RESERVED"
  | "ORDER_RELEASED"
  | "TRADE"
  | "ADJUSTMENT";

/**
 * Private `balance.updated` notification (topic notification.events, key =
 * userId). A projection of the wallet row AFTER the change, written to the
 * outbox in the same transaction — never emitted for an uncommitted change.
 * It is a notification, not the ledger: the Ledger table stays authoritative.
 *
 * `version` is the wallet's updatedAt (ms): a consumer keeps the newest.
 */
export interface BalanceUpdatedEvent {
  eventId: string;
  event: "balance.updated";
  userId: string;
  assetId: string;
  asset: string;
  available: string;
  locked: string;
  total: string;
  reason: BalanceChangeReason;
  referenceId: string;
  version: number;
  timestamp: number;
}

/**
 * Reads the final wallet rows for the given (userId, assetId) pairs and
 * enqueues one balance.updated per pair. Call at the end of the transaction.
 */
export async function enqueueBalanceUpdates(
  tx: Prisma.TransactionClient,
  topic: string,
  pairs: Array<{ userId: string; assetId: string }>,
  reason: BalanceChangeReason,
  referenceId: string,
): Promise<void> {
  const unique = [...new Map(pairs.map((p) => [`${p.userId}:${p.assetId}`, p])).values()];
  if (unique.length === 0) return;

  const wallets = await tx.wallet.findMany({
    where: { OR: unique.map((p) => ({ userId: p.userId, assetId: p.assetId })) },
    include: { asset: { select: { symbol: true } } },
  });

  const now = Date.now();
  await enqueueOutbox(
    tx,
    wallets.map((w) => {
      const event: BalanceUpdatedEvent = {
        eventId: `balance:${reason}:${referenceId}:${w.userId}:${w.assetId}`,
        event: "balance.updated",
        userId: w.userId,
        assetId: w.assetId,
        asset: w.asset.symbol,
        available: w.availableBalance.toFixed(),
        locked: w.lockedBalance.toFixed(),
        total: w.availableBalance.add(w.lockedBalance).toFixed(),
        reason,
        referenceId,
        version: w.updatedAt.getTime(),
        timestamp: now,
      };
      return { topic, key: w.userId, payload: event as unknown as OutboxPayload };
    }),
  );
}

type OutboxPayload = Record<string, unknown> & { eventId: string };
