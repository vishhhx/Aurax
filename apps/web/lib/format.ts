import * as D from "@/lib/decimal"

/**
 * Presentation only. Amounts stay decimal strings everywhere else; these
 * helpers round and group digits on the string itself so large or precise
 * values are never distorted by floats. Compact volume figures are the one
 * place a float is acceptable (they are labelled approximations).
 */

export const EMPTY = "—"

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "12345.678", 2 → "12,345.68". Keeps exactly `decimals` digits unless trim is set. */
export function formatAmount(value: string | null | undefined, decimals: number, opts: { trim?: boolean; sign?: boolean } = {}): string {
  if (value === null || value === undefined || value === "" || !D.isDecimal(value)) return EMPTY
  let fixed = D.toFixed(value, Math.max(0, decimals))
  if (opts.trim && fixed.includes(".")) fixed = fixed.replace(/\.?0+$/, "")
  const negative = fixed.startsWith("-")
  const body = negative ? fixed.slice(1) : fixed
  const [int, frac] = body.split(".")
  const out = `${group(int!)}${frac ? `.${frac}` : ""}`
  if (negative) return `-${out}`
  // Sign follows the rounded figure: -0.004 at 2 dp is "0.00", not "+0.00".
  return opts.sign && !D.isZero(fixed) ? `+${out}` : out
}

/** Approximate compact figure for volumes: "1.2M". */
export function formatCompact(value: string | null | undefined): string {
  if (value === null || value === undefined || !D.isDecimal(value)) return EMPTY
  const n = Number(value)
  if (n !== 0 && Math.abs(n) < 1) return formatAmount(value, 4, { trim: true })
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)
}

/** Server percent string ("1.5625" = 1.5625%) → "+1.56%". */
export function formatPercent(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !D.isDecimal(value)) return EMPTY
  return `${formatAmount(value, decimals, { sign: true })}%`
}

/** Fee rate as a percentage: "0.001" → "0.1%". */
export function formatFeeRate(rate: string): string {
  if (!D.isDecimal(rate)) return EMPTY
  return `${D.normalize(D.mul(rate, "100"))}%`
}

export function direction(value: string | null | undefined): "up" | "down" | "flat" {
  if (value === null || value === undefined || !D.isDecimal(value) || D.isZero(value)) return "flat"
  return value.startsWith("-") ? "down" : "up"
}

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
const dateTime = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})
const date = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" })

const toDate = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(v: string | number | null | undefined): string {
  const d = toDate(v)
  return d ? time.format(d) : EMPTY
}

export function formatDateTime(v: string | number | null | undefined): string {
  const d = toDate(v)
  return d ? dateTime.format(d) : EMPTY
}

export function formatDate(v: string | number | null | undefined): string {
  const d = toDate(v)
  return d ? date.format(d) : EMPTY
}

/** "BTCUSDC" + market → "BTC/USDC". */
export function pairLabel(m: { baseAsset: string; quoteAsset: string }): string {
  return `${m.baseAsset}/${m.quoteAsset}`
}

export function shortId(id: string, keep = 8): string {
  return id.length <= keep + 3 ? id : `${id.slice(0, keep)}…`
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  OPEN: "Open",
  PARTIALLY_FILLED: "Partially filled",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CONFIRMING: "Confirming",
  COMPLETED: "Completed",
  FAILED: "Failed",
  TRADING: "Trading",
  HALTED: "Halted",
  MAINTENANCE: "Maintenance",
  CANCEL_ONLY: "Cancel only",
  POST_ONLY: "Post only",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase()
}

const REASON_LABELS: Record<string, string> = {
  USER_CANCELLED: "Cancelled by you",
  IOC_REMAINING_QUANTITY: "Unfilled remainder of an IOC order",
  MARKET_NO_LIQUIDITY: "No liquidity for the market order",
  INVALID_QUANTITY: "Invalid quantity",
  POST_ONLY_MARKET_ORDER: "Post-only market order",
  POST_ONLY_WOULD_TAKE_LIQUIDITY: "Post-only order would have taken liquidity",
  FOK_NOT_FULLY_FILLABLE: "Fill-or-kill could not be filled completely",
  NOT_OPEN: "Order was no longer open",
  NOT_OWNER: "Order belongs to another account",
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ").toLowerCase()
}
