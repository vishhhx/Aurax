/** Exact decimal-string helpers built on scaled BigInts (no float drift in wire values). */

const decimalsOf = (s: string) => (s.includes(".") ? s.split(".")[1]!.replace(/0+$/, "").length : 0);

function toUnits(value: string, decimals: number): bigint {
  const [int = "0", frac = ""] = value.split(".");
  return BigInt(int + frac.padEnd(decimals, "0").slice(0, decimals));
}

function fromUnits(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const s = (neg ? -units : units).toString().padStart(decimals + 1, "0");
  const out = decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s;
  return (neg ? "-" : "") + (decimals ? out.replace(/\.?0+$/, "") : out);
}

/** Round a number onto a step grid ("0.01", "0.000001"), returning an exact decimal string. */
export function roundToStep(value: number, step: string, mode: "down" | "up" | "nearest" = "nearest"): string {
  const d = decimalsOf(step);
  const stepUnits = toUnits(step, d);
  const scaled = value * 10 ** d;
  const n = Number(stepUnits);
  const k = mode === "down" ? Math.floor(scaled / n + 1e-9) : mode === "up" ? Math.ceil(scaled / n - 1e-9) : Math.round(scaled / n);
  return fromUnits(BigInt(k) * stepUnits, d);
}

/** True when `value` is an exact multiple of `step`. */
export function onStep(value: string, step: string): boolean {
  const d = Math.max(decimalsOf(step), decimalsOf(value));
  return toUnits(value, d) % toUnits(step, d) === 0n;
}

export const fmt = (v: string | number | null | undefined, dp = 2) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
