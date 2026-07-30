import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit"
import axios from "axios"
import type { RootState } from "../index"
import type { AuthState, UserDetails } from "../types"
import { api } from "@/lib/axios"

const API_AUTH = "/api/v1/auth/auth"
const API_SESSIONS = "/api/v1/auth/sessions"

type AuthError = {
  message: string
  status?: number
}

export const fetchUserDetails = createAsyncThunk<
  UserDetails,
  void,
  { state: RootState; rejectValue: AuthError }
>("auth/fetchUserDetails", async (_, { rejectWithValue }) => {
  try {
    const res = await api.get(`${API_AUTH}/details`)
    return res.data.data as UserDetails
  } catch (err: unknown) {
    const response = axios.isAxiosError(err) ? err.response : undefined
    const data = response?.data as { message?: unknown } | undefined
    return rejectWithValue({
      message:
        typeof data?.message === "string"
          ? data.message
          : "Failed to fetch user details",
      status: response?.status,
    })
  }
}, {
  // React Strict Mode and the OAuth callback can both try to bootstrap. Only
  // one request is needed; the server remains the source of truth.
  condition: (_, { getState }) => getState().auth.status !== "checking",
})

const initialState: AuthState = {
  user: null,
  status: "unknown",
  error: null,
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearSession(state) {
      state.user = null
      state.status = "unauthenticated"
      state.error = null
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload
    },

    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserDetails.pending, (state) => {
        state.status = "checking"
        state.error = null
      })
      .addCase(fetchUserDetails.fulfilled, (state, action) => {
        state.user = action.payload
        state.status = "authenticated"
        state.error = null
      })
      .addCase(fetchUserDetails.rejected, (state, action) => {
        state.user = null
        const error = action.payload

        // A missing/expired cookie is an ordinary signed-out state. Do not
        // redirect on a network or 5xx failure: that would turn an outage into
        // a false logout.
        if (error?.status === 401 || error?.status === 403) {
          state.status = "unauthenticated"
          state.error = null
        } else {
          state.status = "error"
          state.error = error?.message ?? "Unable to check your session"
        }
      })
  },
})

export const signOut = createAsyncThunk("auth/signOut", async (_, { dispatch }) => {
  try {
    // The backend must revoke/clear both HttpOnly cookies. There is no token
    // value in JavaScript to remove.
    await api.post(`${API_SESSIONS}/logout`, undefined, { skipAuthRefresh: true })
  } finally {
    dispatch(clearSession())
  }
})

export const selectIsAuthenticated = (state: RootState) =>
  state.auth.status === "authenticated" && state.auth.user !== null

export const selectIsSessionLoading = (state: RootState) =>
  state.auth.status === "unknown" || state.auth.status === "checking"

export const { clearSession, setError, clearError } =
  authSlice.actions
export default authSlice.reducer
