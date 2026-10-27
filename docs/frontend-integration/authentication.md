# Authentication and sessions

Verified against `apps/auth-service`, `packages/core/src/jwt.ts` and every
service's `auth.middleware.ts` (2026-10-26).

## Summary

| Item | Value |
|---|---|
| Sign-in methods | **Google and GitHub OAuth only**. Email/password code exists in `services/auth.ts` but has **no routes**. |
| Access token | JWT (HS256, `JWT_ACCESS_SECRET`), **15 min**, claims `userId, email, name, jti, iat, exp` |
| Refresh token | JWT (`JWT_REFRESH_SECRET`), **30 days**, single use (rotated on every refresh) |
| Transport (browser) | HttpOnly cookies `accessToken` and `refreshToken`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, `Path=/` |
| Transport (non-browser) | `Authorization: Bearer <token>` (access token for APIs, refresh token for `/sessions/refresh` and `/sessions/logout`) |
| Server session | Redis key `session:<refreshToken>`, TTL 30 days, deleted on rotation and logout |
| Verification | each service verifies the access JWT itself; the gateway does not |

Tokens never appear in URLs. The browser never needs to read a token: both
cookies are HttpOnly and are sent automatically with `withCredentials`.

## Sign-in flow

```mermaid
sequenceDiagram
  participant B as Browser (apps/web)
  participant G as api-gateway
  participant A as auth-service
  participant P as Google / GitHub

  B->>G: GET /api/v1/auth/oauth2/google (withCredentials)
  G->>A: GET /oauth2/google
  A-->>B: 200 { data: "<provider authorize URL with state>" } · Set-Cookie oauthState
  B->>P: window.location = data
  P->>G: 302 /api/v1/auth/oauth2/google/callback?code=…&state=…
  G->>A: callback (cookie oauthState must equal state; Redis key consumed)
  A->>P: exchange code, read profile (email)
  A->>A: find-or-create user (Mongo), issue tokens, store session (Redis)
  A-->>B: Set-Cookie accessToken, refreshToken · 302 → FRONTEND_URL/auth/success
  B->>G: GET /api/v1/auth/details (cookie)
  G-->>B: user profile
```

- Failure: any callback error sends `302 → FRONTEND_URL/login?error=auth_failed`
  without setting cookies. The login page already displays this.
- The OAuth redirect URIs registered with the providers must point at the
  **gateway** (`http://localhost:5000/api/v1/auth/oauth2/<provider>/callback`
  in development).
- **CSRF `state` (both providers).** The init call creates a random `state`,
  stores it in Redis (`oauth:<provider>:<state>`, 5 min, single use) and sets
  it in an HttpOnly `oauthState` cookie. The callback accepts only a `state`
  that equals this browser's cookie and still exists in Redis, so a callback
  link started in another browser is rejected. The init request must
  therefore be made **with credentials** (`api.get`, which the login page
  already does), and the redirect must follow within 5 minutes.
- Users are matched **by email**, so a Google and a GitHub login with the
  same email are the same account.

## Cookies and origins

The cookies are set by the API origin (`localhost:5000` in development) with
`SameSite=Lax`. `SameSite` is about *site*, not port, so `localhost:3000` and
`localhost:5000` are same-site, and XHR/fetch with credentials sends the
cookies. In production:

- Serve the web app and the API on the **same registrable domain** (for
  example `app.example.com` and `api.example.com`). Otherwise `Lax` cookies are
  not sent on cross-site XHR and the session silently fails.
- Set `NODE_ENV=production` so cookies are `Secure` (HTTPS only).
- Set `CORS_ORIGINS` on api-gateway and websockets to the exact web origin(s).
  Credentials are allowed only for those origins.

## Refresh

`POST /api/v1/auth/sessions/refresh`, with an empty body, sends the
`refreshToken` cookie automatically.

1. The backend verifies the JWT signature and expiry, and that
   `session:<token>` exists in Redis.
2. It deletes the old session and issues a new pair, with a new Redis session.
3. It sets both cookies and returns `{ accessToken }`.

Reusing an already rotated refresh token returns 401. A browser that sends two
refreshes concurrently will see one of them fail, so **refresh must be
single-flight**. `apps/web/lib/axios.ts` already queues requests behind one
refresh.

Recommended client behaviour:
- On a 401 from any API, refresh once, then retry the request.
- If the refresh itself returns 401, clear the client state and go to `/login`.
- Never refresh in a loop. Mark refresh and logout requests with
  `skipAuthRefresh`.

Access tokens are not revoked server-side. After logout or refresh, an old
access token stays valid until it expires, up to 15 minutes.

## Logout

`POST /api/v1/auth/sessions/logout`:
- deletes the Redis session for the presented refresh token (cookie or Bearer);
- clears both cookies;
- always returns 200 (idempotent).

It does not sign out the user's other devices: there is no "log out
everywhere" endpoint.

## WebSocket authentication

The socket gateway reads the access token from (first match wins):

1. handshake `auth.token`;
2. the `Authorization: Bearer` header;
3. the `accessToken` cookie. This is what browsers use: connect with
   `withCredentials: true` to `NEXT_PUBLIC_SOCKET_URL`.

There is no token, or the token is invalid or expired? The socket still
connects, as **public-only**, and receives
`session { authenticated: false, reason? }`. After a successful refresh,
reconnect the socket so it picks up the new cookie and joins its private room.
See [websocket-api.md](websocket-api.md).

## Profile

`GET /api/v1/auth/details` returns:

```json
{ "userId", "email", "name", "provider": "google|github", "isEmailVerified", "lastLogin", "createdAt" }
```

It is cached for up to 1 hour, so a name change at the provider shows up late.
There is no profile update endpoint.

## Not available

The following do not exist in the backend today:
- email/password sign-up and sign-in;
- email verification;
- password reset;
- 2FA/TOTP;
- device/session list and per-device revoke;
- API keys;
- account deletion.

The frontend must not show these as working. Options and proposals are in
[missing-backend-capabilities.md](missing-backend-capabilities.md).
