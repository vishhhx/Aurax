import { apiGet, apiPost } from "./client"
import type { OAuthProvider, UserProfile } from "./types"

/**
 * auth-service (api-gateway /api/v1/auth). Sign-in is Google or GitHub OAuth
 * only; email/password, recovery, 2FA, session lists and API keys have no
 * routes (docs/frontend-integration/authentication.md).
 */

const BASE = "/api/v1/auth"

export const authApi = {
  /**
   * Returns the provider authorize URL and sets the HttpOnly oauthState cookie
   * that the callback checks, so it must be called with credentials right
   * before navigating.
   */
  oauthUrl: (provider: OAuthProvider) => apiGet<string>(`${BASE}/oauth2/${provider}`),
  me: () => apiGet<UserProfile>(`${BASE}/details`),
  /** Idempotent; revokes this browser's refresh session and clears both cookies. */
  logout: () => apiPost<null>(`${BASE}/sessions/logout`, undefined, { skipAuthRefresh: true }),
}
