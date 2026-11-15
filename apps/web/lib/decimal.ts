/**
 * Exact decimal arithmetic on the backend's decimal strings.
 *
 * Every amount crossing the API is a string such as "0.00012". Anything that
 * is submitted, compared against a trading rule or used to decide whether an
 * order is allowed goes through these helpers, never through JS floats.
 * A value is held as an integer mantissa and a scale: value = m / 10^s.
 */

export type Rounding = "down" | "up" | "half-up"

interface Dec {
  m: bigint
  s: number
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/
/** Digits and at most one dot, as a user types it ("", "1.", ".5" allowed). */
const INPUT_RE = /^\d*\.?\d*$/

export function isDecimal(value: string): boolean {
  return DECIMAL_RE.test(value)
}

/** True for partial input a user may still be typing. */
export function isDecimalInput(value: string): boolean {
  return INPUT_RE.test(value)
}

/** Normalises typed input ("1." → "1", ".5" → "0.5"); null when not a number. */
export function normalizeInput(value: string): string | null {
  const v = value.trim()
  if (v === "" || v === ".") return null
  const fixed = v.startsWith(".") ? `0${v}` : v.endsWith(".") ? v.slice(0, -1) : v
  return isDecimal(fixed) ? fixed : null
}

function parse(value: string): Dec {
  if (!isDecimal(value)) throw new Error(`Invalid decimal: ${value}`)
  const negative = value.startsWith("-")
  const body = negative ? value.slice(1) : value
  const [int, frac = ""] = body.split(".")
  const m = BigInt(int + frac)
  return { m: negative ? -m : m, s: frac.length }
}

const pow10 = (n: number) => 10n ** BigInt(n)

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  if (a.s === b.s) return [a.m, b.m, a.s]
  if (a.s > b.s) return [a.m, b.m * pow10(a.s - b.s), a.s]
  return [a.m * pow10(b.s - a.s), b.m, b.s]
}

function format(d: Dec): string {
  const negative = d.m < 0n
  let digits = (negative ? -d.m : d.m).toString()
  if (d.s > 0) {
    digits = digits.padStart(d.s + 1, "0")
    const int = digits.slice(0, digits.length - d.s)
    const frac = digits.slice(digits.length - d.s).replace(/0+$/, "")
    digits = frac ? `${int}.${frac}` : int
  }
  return negative && digits !== "0" ? `-${digits}` : digits
}

/** Integer division of a by b (b > 0) with the given rounding. */
function divRound(a: bigint, b: bigint, mode: Rounding): bigint {
  const negative = a < 0n !== b < 0n
  const absA = a < 0n ? -a : a
  const absB = b < 0n ? -b : b
  let q = absA / absB
  const r = absA % absB
  if (r !== 0n) {
    // Rounding is applied to the magnitude; "down" truncates toward zero.
    if (mode === "up" || (mode === "half-up" && r * 2n >= absB)) q += 1n
  }
  return negative ? -q : q
}

function rescale(d: Dec, scale: number, mode: Rounding): Dec {
  if (d.s <= scale) return { m: d.m * pow10(scale - d.s), s: scale }
  return { m: divRound(d.m, pow10(d.s - scale), mode), s: scale }
}

export function add(a: string, b: string): string {
  const [x, y, s] = align(parse(a), parse(b))
  return format({ m: x + y, s })
}

export function sub(a: string, b: string): string {
  const [x, y, s] = align(parse(a), parse(b))
  return format({ m: x - y, s })
}

export function mul(a: string, b: string): string {
  const x = parse(a)
  const y = parse(b)
  return format({ m: x.m * y.m, s: x.s + y.s })
}

/** a / b rounded to `scale` fraction digits. Throws on division by zero. */
export function div(a: string, b: string, scale: number, mode: Rounding = "down"): string {
  const x = parse(a)
  const y = parse(b)
  if (y.m === 0n) throw new Error("Division by zero")
  // a/b = (x.m / 10^x.s) / (y.m / 10^y.s); shift so the quotient has `scale` digits.
  const num = x.m * pow10(scale + y.s)
  const den = y.m * pow10(x.s)
  return format({ m: divRound(num, den, mode), s: scale })
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  const [x, y] = align(parse(a), parse(b))
  return x === y ? 0 : x < y ? -1 : 1
}

export const eq = (a: string, b: string) => cmp(a, b) === 0
export const lt = (a: string, b: string) => cmp(a, b) < 0
export const lte = (a: string, b: string) => cmp(a, b) <= 0
export const gt = (a: string, b: string) => cmp(a, b) > 0
export const gte = (a: string, b: string) => cmp(a, b) >= 0

export function isZero(a: string): boolean {
  return parse(a).m === 0n
}

export function max(a: string, b: string): string {
  return gte(a, b) ? a : b
}

export function min(a: string, b: string): string {
  return lte(a, b) ? a : b
}

/** True when value is an exact integer multiple of step (step > 0). */
export function isMultipleOf(value: string, step: string): boolean {
  const [x, y] = align(parse(value), parse(step))
  if (y === 0n) return false
  return x % y === 0n
}

/** Rounds to `scale` fraction digits and returns the canonical string. */
export function round(value: string, scale: number, mode: Rounding = "half-up"): string {
  return format(rescale(parse(value), scale, mode))
}

/** Like round(), but keeps trailing zeros: toFixed("1.5", 3) → "1.500". */
export function toFixed(value: string, scale: number, mode: Rounding = "half-up"): string {
  const d = rescale(parse(value), scale, mode)
  const negative = d.m < 0n
  let digits = (negative ? -d.m : d.m).toString()
  if (scale > 0) {
    digits = digits.padStart(scale + 1, "0")
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
  }
  return negative && d.m !== 0n ? `-${digits}` : digits
}

/** Rounds value down to a multiple of step (step > 0, value ≥ 0). */
export function floorToStep(value: string, step: string): string {
  const [x, y, s] = align(parse(value), parse(step))
  if (y <= 0n) throw new Error("Step must be positive")
  return format({ m: (x / y) * y, s })
}

/** Number of fraction digits as written ("1.50" → 2). */
export function fractionDigits(value: string): number {
  const dot = value.indexOf(".")
  return dot === -1 ? 0 : value.length - dot - 1
}

/** Canonical form ("001.500" → "1.5"). */
export function normalize(value: string): string {
  return format(parse(value))
}
