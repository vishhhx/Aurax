import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit"
import type { WalletAsset, WalletState } from "./walletSlice.types"
import { api } from "@/lib/axios"

export const fetchWalletAssets = createAsyncThunk<WalletAsset[], void, { rejectValue: string }>(
  "wallet/fetchAssets",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/api/v1/wallet/assets")
      return res.data.data as WalletAsset[]
    } catch (err: any) {
      console.log(err)
      return rejectWithValue(err.response?.data?.message || "Failed to fetch assets")
    }
  },
)

const initialState: WalletState = {
  assets: [],
  versions: {},
  isLoading: false,
  error: null,
}

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    clearWalletError(state) {
      state.error = null
    },
    /**
     * Live `balance.updated` from the private socket channel. `version` is the
     * wallet's updatedAt; older notifications never overwrite newer state.
     */
    applyBalanceUpdate(
      state,
      action: PayloadAction<{ assetId: string; available: string; locked: string; version: number }>,
    ) {
      const { assetId, available, locked, version } = action.payload
      const asset = state.assets.find((a) => a.assetId === assetId)
      if (!asset) return
      if ((state.versions[assetId] ?? 0) > version) return
      state.versions[assetId] = version
      asset.availableBalance = available
      asset.lockedBalance = locked
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWalletAssets.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchWalletAssets.fulfilled, (state, action) => {
        state.isLoading = false
        state.assets = action.payload
      })
      .addCase(fetchWalletAssets.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? "Unknown error"
      })
  },
})

export const { clearWalletError, applyBalanceUpdate } = walletSlice.actions
export default walletSlice.reducer
