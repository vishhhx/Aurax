# Frontend environment

## Variables (`apps/web`)

Every variable the frontend reads is public (`NEXT_PUBLIC_*`) and is inlined
into the browser bundle at build time. **Never put a secret here.**

| Variable | Default in code | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | api-gateway origin; all REST calls go to `${API}/api/v1/...` |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:5005` | websockets (socket.io) origin |
| `NEXT_PUBLIC_RAZORPAY_KEY` | a hard-coded test key id (to be removed) | Razorpay **key id** (public). It must belong to the same Razorpay account as wallet-service's `RAZORPAY_CLIENT_ID`, or checkout cannot pay the order |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | `true` shows the simulated market (clearly labelled) instead of real data |

`apps/web/.env.example` lists these. The local `apps/web/.env` is git-ignored.
It currently defines `RAZORPAY_KEY`, a name the code never reads: rename it to
`NEXT_PUBLIC_RAZORPAY_KEY`. (The file is private, so it was not edited.)

## Local stack

| Process | Port | Start |
|---|---|---|
| Redis, MongoDB, Postgres, Kafka | 6379, 27017, 5432, 9092 | `docker compose up -d` (repo root) |
| api-gateway | 5000 | `bun run dev` in `apps/api-gateway` |
| auth-service | 5001 | `apps/auth-service` |
| wallet-service | 5002 (gRPC 8002) | `apps/wallet-service` |
| order-service | 5003 | `apps/order-service` |
| market-service | 5004 | `apps/market-service` (waits for the engine to be LIVE) |
| engine | gRPC 8003, 8004 | `apps/engine` (two shards: `MARKETS_A`, `MARKETS_B`) |
| websockets | 5005 | `apps/websockets` |
| web | 3000 | `apps/web` |

`bun run dev` at the root starts all of these through turbo.

Steps:
1. Copy each service's `.env.example` to `.env` and fill in the secrets. Use
   the **same** `JWT_ACCESS_SECRET` in auth, wallet, order and websockets.
   The gateway does not verify tokens.
2. Apply the database schema with `bun run migrate:deploy` in
   `packages/postgres`.
3. Seed BTCUSDC, ETHUSDC, SOLUSDC and USDTUSDC, plus their assets, with
   `bun run seed`.

The browser needs only the gateway and websockets ports. The other ports
must not be exposed outside the machine or private network.

## Cookies, CORS and origins

- The API sets the auth cookies on the gateway origin. The web app must call
  the API **with credentials** (axios `withCredentials: true`).
- `localhost:3000` → `localhost:5000` is same-site, so `SameSite=Lax` cookies
  work in development.
- In production, use one registrable domain (for example `app.` and `api.`),
  HTTPS and `NODE_ENV=production` (so cookies are `Secure`).
- Set `CORS_ORIGINS` (comma-separated) on **api-gateway** and
  **websockets** to the exact web origin(s).
- Set the OAuth redirect URIs registered at Google and GitHub to the gateway:
  `<API>/api/v1/auth/oauth2/{google,github}/callback`.
- Set `FRONTEND_URL` in auth-service to the web origin. The OAuth callback
  redirects there.

## Third parties

| Dependency | Development | Notes |
|---|---|---|
| Google / GitHub OAuth | test apps with localhost redirect URIs | no sandbox: login needs real provider apps |
| Razorpay | **test mode** keys only | the webhook must reach `<API>/api/v1/wallet/webhook/razorpay`, so use a tunnel locally. Without it, deposits stay `CONFIRMING` after `verify`. Never use live keys in development |

## Security checklist for frontend code

1. Tokens live only in HttpOnly cookies. Never read, store or log them, and
   never put them in URLs or `localStorage`.
2. Never send `userId` to the backend for authorisation; the server takes it
   from the token.
3. Treat every amount as a decimal string. Format it for display; never use
   float math for anything that is submitted.
4. Show `message` from error envelopes, never stack traces. The backend
   omits stacks unless `NODE_ENV=development`.
5. Demo data is only shown when `NEXT_PUBLIC_DEMO_MODE=true`, and is always
   labelled.
