export interface UserDetails {
  userId: string
  email: string
  name: string
  provider: "google" | "github" | "local"
  isEmailVerified: boolean
  lastLogin?: string
  createdAt?: string
}

export interface AuthState {
  user: UserDetails | null
  /**
   * The result of asking the server for the current cookie-backed session.
   * `unknown` and `checking` must never be treated as signed out.
   */
  status: "unknown" | "checking" | "authenticated" | "unauthenticated" | "error"
  error: string | null
}
