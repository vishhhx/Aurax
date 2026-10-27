/**
 * Exact fixed-point decimals for market data.
 *
 * Every authoritative price, quantity and volume is held as a `bigint` scaled
 * by 10^18 (matching the `Decimal(38, 18)` database columns), never as a JS
 * float. Strings are the wire and storage format.
 */

export const DECIMALS = 18;
export const SCALE = 10n ** BigInt(DECIMALS);

// Plain or scientific notation. The matching engine serialises JS numbers with
// `Number#toString()`, which produces values like "1e-7" for small quantities.
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export class DecimalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecimalError";
  }
}

/**
 * Converts a non-negative decimal string (plain or scientific notation) to a
 * canonical plain string without trailing fractional zeros. Throws
 * `DecimalError` for anything else, including values needing more than 18
 * fractional digits.
 */
export function normalizeDecimal(input: string): string {
  return formatScaled(toScaled(input));
}

export function toScaled(input: string): bigint {
  if (typeof input !== "string") {
    throw new DecimalError(`Decimal must be a string, received ${typeof input}`);
  }

  const match = DECIMAL_PATTERN.exec(input.trim());

  if (!match) {
    throw new DecimalError(`Invalid decimal value: ${input}`);
  }

  const [, whole = "0", fraction = "", exponentText] = match;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 64) {
    throw new DecimalError(`Decimal exponent out of range: ${input}`);
  }

  // value = digits × 10^(exponent - fraction.length)
  const digits = BigInt(`${whole}${fraction}`);
  const shift = exponent - fraction.length + DECIMALS;

  if (shift >= 0) {
    return digits * 10n ** BigInt(shift);
  }

  const divisor = 10n ** BigInt(-shift);

  if (digits % divisor !== 0n) {
    throw new DecimalError(`Decimal exceeds ${DECIMALS} fractional digits: ${input}`);
  }

  return digits / divisor;
}

export function formatScaled(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(DECIMALS, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Product of two scaled values, truncated toward zero to 18 places. */
export function mulScaled(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}

/** Percentage change `(to - from) / from × 100`, or null when `from` is zero. */
export function percentChangeScaled(from: bigint, to: bigint): bigint | null {
  if (from === 0n) return null;
  return ((to - from) * 100n * SCALE) / from;
}

export function compareScaled(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isDecimalString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    toScaled(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialises a Prisma/decimal.js `Decimal` as a canonical plain string.
 * `Decimal#toString()` switches to exponent notation for small values
 * (e.g. "1e-7"); `toFixed()` never does.
 */
export function fromDbDecimal(value: { toFixed(): string }): string {
  return normalizeDecimal(value.toFixed());
}
