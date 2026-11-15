import { apiGet, apiPost } from "./client"
import type { PageQuery } from "./orders"
import type {
  Deposit,
  DepositQuote,
  DepositStatus,
  LedgerEntry,
  LedgerReferenceType,
  RazorpayOrder,
  VerifyPaymentResponse,
  WalletAsset,
} from "./types"

/**
 * wallet-service (api-gateway /api/v1/wallet, access token required).
 *
 * Only the signed Razorpay webhook credits a deposit. `verify` moves it to
 * CONFIRMING; the UI must wait for deposit.completed or poll the deposit.
 * No withdrawal API exists.
 */

const BASE = "/api/v1/wallet"

type RawAsset = Omit<WalletAsset, "availableBalance" | "lockedBalance"> & {
  availableBalance: string | number
  lockedBalance: string | number
}

export const walletApi = {
  // Balances are documented as strings; coerce defensively so one type flows through the app.
  assets: async (): Promise<WalletAsset[]> =>
    (await apiGet<RawAsset[]>(`${BASE}/assets`)).map((a) => ({
      ...a,
      availableBalance: String(a.availableBalance ?? "0"),
      lockedBalance: String(a.lockedBalance ?? "0"),
    })),
  quote: (amountInr: string) => apiGet<DepositQuote>(`${BASE}/payment/razorpay/quote`, { amount: amountInr }),
  initDeposit: (amountInr: string) => apiPost<RazorpayOrder>(`${BASE}/payment/razorpay/init-deposit`, { amount: amountInr }),
  verifyPayment: (body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    apiPost<VerifyPaymentResponse>(`${BASE}/payment/razorpay/verify`, body),
  deposits: (q: { status?: DepositStatus } & PageQuery = {}) =>
    apiGet<Deposit[]>(`${BASE}/deposits`, { status: q.status, limit: q.limit ?? 50, before: q.before }),
  deposit: (depositId: string) => apiGet<Deposit>(`${BASE}/deposits/${encodeURIComponent(depositId)}`),
  ledger: (q: { assetId?: string; referenceType?: LedgerReferenceType } & PageQuery = {}) =>
    apiGet<LedgerEntry[]>(`${BASE}/ledger`, { assetId: q.assetId, referenceType: q.referenceType, limit: q.limit ?? 50, before: q.before }),
}
