import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { walletApi } from "@/lib/api/wallet"
import { toApiError } from "@/lib/api/client"
import type { WalletAsset } from "@/lib/api/types"
import { signOut, sessionExpired } from "./auth"

/**
 * Balances from GET /wallet/assets, kept live by `balance.updated`. Each event
 * carries the wallet row's absolute available/locked values and a `version`
 * (the row's update time): the highest version wins and older or replayed
 * events are ignored. Balances are never accumulated from deltas.
 */

export interface WalletState {
  assets: WalletAsset[]
  /** Latest applied balance version per assetId */
  versions: Record<string, number>
  status: "idle" | "loading" | "ready" | "error"
  error: string | null
  /** Client time each asset last took an event (guards slower REST responses) */
  eventAt: Record<string, number>
  /** Set when an event names an asset we do not have; triggers a refetch */
  stale: boolean
}

const initialState: WalletState = { assets: [], versions: {}, eventAt: {}, status: "idle", error: null, stale: false }

export const fetchWallet = createAsyncThunk<{ assets: WalletAsset[]; startedAt: number }, void, { rejectValue: string }>("wallet/fetch", async (_, { rejectWithValue }) => {
  const startedAt = Date.now()
  try {
    return { assets: await walletApi.assets(), startedAt }
  } catch (err) {
    return rejectWithValue(toApiError(err, "Failed to load balances").message)
  }
})

export interface BalanceUpdate {
  assetId: string
  available: string
  locked: string
  version: number
}

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    balanceUpdated(state, action: PayloadAction<BalanceUpdate>) {
      const { assetId, available, locked, version } = action.payload
      if ((state.versions[assetId] ?? -1) >= version) return
      const asset = state.assets.find((a) => a.assetId === assetId)
      if (!asset) {
        state.stale = true
        return
      }
      state.versions[assetId] = version
      state.eventAt[assetId] = Date.now()
      asset.availableBalance = available
      asset.lockedBalance = locked
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchWallet.pending, (s) => {
      s.status = s.status === "ready" ? "ready" : "loading"
      s.error = null
    })
      .addCase(fetchWallet.fulfilled, (s, a) => {
        // The REST row wins unless an event landed after this request started:
        // that event is at least as new as whatever the response carries.
        const { assets, startedAt } = a.payload
        s.assets = assets.map((fresh) => {
          const cur = s.assets.find((x) => x.assetId === fresh.assetId)
          if (cur && (s.eventAt[fresh.assetId] ?? 0) >= startedAt) {
            return { ...fresh, availableBalance: cur.availableBalance, lockedBalance: cur.lockedBalance }
          }
          return fresh
        })
        s.status = "ready"
        s.stale = false
      })
      .addCase(fetchWallet.rejected, (s, a) => {
        s.status = s.assets.length ? "ready" : "error"
        s.error = a.payload ?? "Failed to load balances"
      })
      .addCase(signOut.fulfilled, () => initialState)
      .addCase(sessionExpired, () => initialState)
  },
})

export const { balanceUpdated } = walletSlice.actions
export default walletSlice.reducer

type WithWallet = { wallet: WalletState }
export const selectAssets = (s: WithWallet) => s.wallet.assets
export const selectAssetBySymbol = (symbol: string) => (s: WithWallet) => s.wallet.assets.find((a) => a.symbol === symbol)
