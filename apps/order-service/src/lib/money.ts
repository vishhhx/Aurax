import { Prisma } from "@repo/pg";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/**
 * Balances, reservations and ledger amounts are stored as Decimal(30, 8).
 * Amounts are rounded to that scale explicitly (ROUND_HALF_UP, the same rule
 * Postgres applies on write) so the values computed here are exactly the
 * values persisted, and reservations/settlements reconcile to the last unit.
 */
export const WALLET_SCALE = 8;

export const dec = (v: string | number | Prisma.Decimal) => new Decimal(v);

export const toWallet = (v: Prisma.Decimal) => v.toDecimalPlaces(WALLET_SCALE, Decimal.ROUND_HALF_UP);

/** Amounts the user must have reserved are rounded UP so a reservation is never short. */
export const toWalletUp = (v: Prisma.Decimal) => v.toDecimalPlaces(WALLET_SCALE, Decimal.ROUND_UP);

/** True when `value` is an exact multiple of `step` (step > 0). */
export const isMultipleOf = (value: Prisma.Decimal, step: Prisma.Decimal) =>
  step.lte(0) || value.mod(step).eq(0);

export const plain = (v: Prisma.Decimal) => v.toFixed();
