import { createSlice, createAsyncThunk } from "@reduxjs/toolkit"
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

export const { clearWalletError } = walletSlice.actions
export default walletSlice.reducer
