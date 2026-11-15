import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { authApi } from "@/lib/api/auth"
import { toApiError } from "@/lib/api/client"
import type { UserProfile } from "@/lib/api/types"

/**
 * The cookie-backed session as the server reports it. `unknown` and
 * `checking` must never be treated as signed out (that causes redirect
 * flicker on reload).
 */
export type AuthStatus = "unknown" | "checking" | "authenticated" | "unauthenticated" | "error"

export interface AuthState {
  user: UserProfile | null
  status: AuthStatus
  error: string | null
}

const initialState: AuthState = { user: null, status: "unknown", error: null }

export const fetchSession = createAsyncThunk<UserProfile, void, { state: { auth: AuthState }; rejectValue: { message: string; status: number | null } }>(
  "auth/fetchSession",
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.me()
    } catch (err) {
      const e = toApiError(err, "Unable to check your session")
      return rejectWithValue({ message: e.message, status: e.status })
    }
  },
  // Strict Mode and /auth/success may both bootstrap; one request is enough.
  { condition: (_, { getState }) => getState().auth.status !== "checking" },
)

export const signOut = createAsyncThunk("auth/signOut", async () => {
  try {
    await authApi.logout()
  } catch {
    // Logout is idempotent server-side; the local session is cleared regardless.
  }
})

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionExpired(state) {
      state.user = null
      state.status = "unauthenticated"
      state.error = null
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchSession.pending, (s) => {
      s.status = "checking"
      s.error = null
    })
      .addCase(fetchSession.fulfilled, (s, a) => {
        s.user = a.payload
        s.status = "authenticated"
      })
      .addCase(fetchSession.rejected, (s, a) => {
        s.user = null
        const status = a.payload?.status
        if (status === 401 || status === 403 || status === 404) {
          s.status = "unauthenticated"
          s.error = null
        } else {
          s.status = "error"
          s.error = a.payload?.message ?? "Unable to check your session"
        }
      })
      .addCase(signOut.fulfilled, (s) => {
        s.user = null
        s.status = "unauthenticated"
        s.error = null
      })
  },
})

export const { sessionExpired } = authSlice.actions
export default authSlice.reducer

type WithAuth = { auth: AuthState }
export const selectUser = (s: WithAuth) => s.auth.user
export const selectAuthStatus = (s: WithAuth) => s.auth.status
export const selectIsAuthenticated = (s: WithAuth) => s.auth.status === "authenticated" && s.auth.user !== null
export const selectIsSessionPending = (s: WithAuth) => s.auth.status === "unknown" || s.auth.status === "checking"
