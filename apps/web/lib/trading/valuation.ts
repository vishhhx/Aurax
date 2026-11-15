import * as D from "@/lib/decimal"
import type { Ticker, WalletAsset } from "@/lib/api/types"

/**
 * Estimated value in USDC (missing-backend-capabilities.md #9): there is no
 * valuation API, so a balance is valued at the last price of <ASSET>USDC.
 * USDC counts as 1. Assets without a USDC market or without a trade yet
 * cannot be valued and are reported separately — never guessed.
 */

export const VALUATION_ASSET = "USDC"

export function totalBalance(a: Pick<WalletAsset, "availableBalance" | "lockedBalance">): string {
  return D.add(a.availableBalance, a.lockedBalance)
}

export function assetValue(symbol: string, amount: string, tickers: Record<string, Ticker>): string | null {
  if (symbol === VALUATION_ASSET) return amount
  const price = tickers[`${symbol}${VALUATION_ASSET}`]?.lastPrice
  return price ? D.mul(amount, price) : null
}

export function portfolioValue(assets: WalletAsset[], tickers: Record<string, Ticker>): { total: string; unvalued: string[] } {
  let total = "0"
  const unvalued: string[] = []
  for (const a of assets) {
    const amount = totalBalance(a)
    if (D.isZero(amount)) continue
    const v = assetValue(a.symbol, amount, tickers)
    if (v === null) unvalued.push(a.symbol)
    else total = D.add(total, v)
  }
  return { total, unvalued }
}
