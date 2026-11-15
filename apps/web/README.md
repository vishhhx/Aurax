# Aurax web

Next.js 16 (App Router) frontend for the Aurax exchange. It talks only to
api-gateway (HTTP) and websockets (socket.io), as described in
[`docs/frontend-integration`](../../docs/frontend-integration/README.md).

## Scripts

```bash
bun run dev          # next dev on :3000
bun run build        # production build
bun run lint         # eslint
bun run typecheck    # tsc --noEmit
bun test             # unit + component tests (bun:test, happy-dom)
```

Environment variables are listed in [`.env.example`](.env.example).

## Routes

| Area | Routes |
|---|---|
| Public (`app/(site)`) | `/`, `/markets`, `/markets/[symbol]`, `/fees`, `/status` |
| Auth (`app/(auth)`, `app/auth`) | `/login`, `/register`, `/forgot-password`, `/auth/success` |
| Trading (`app/trade`) | `/trade` → first market, `/trade/[symbol]` |
| Signed in (`app/(app)`) | `/dashboard`, `/wallet`, `/wallet/deposit`, `/wallet/deposits/[id]`, `/wallet/withdraw`, `/wallet/history`, `/orders`, `/orders/history`, `/orders/trades`, `/orders/[id]`, `/account`, `/account/{security,notifications,preferences,api-keys}` |
| Legacy | `/payment/razorpay` → `/wallet/deposit` |

## Structure

| Path | Responsibility |
|---|---|
| `lib/api/` | the one HTTP client (`client.ts`: credentials, single-flight refresh, `ApiError`) and typed endpoint modules |
| `lib/ws/` | the one socket (`socket.ts`), market channel multiplexer (`market-stream.ts`), private events (`user-stream.ts`), depth sync (`depth-book.ts`), zod schemas |
| `lib/decimal.ts` | exact decimal-string arithmetic (BigInt); used for every rule check and submitted value |
| `lib/trading/` | pre-trade checks mirroring order-service, reservation preview, valuation |
| `lib/stores/` | shared market data (markets, tickers) and per-device preferences |
| `store/` | Redux: auth session, wallet balances (versioned), open orders (event-merged), notifications |
| `hooks/` | React bindings: market data, account, orders |
| `components/app/` | providers, header/footer, `AccountSync` (private events → state), route guard |
| `components/{trade,markets,wallet,orders,account}` | feature UI |

## Data rules the UI follows

- Amounts are decimal strings end to end; floats are used only to plot charts and size depth bars.
- `202` from `POST /order` means reserved and queued. Orders show as Pending until private events or `GET /order/:id` say otherwise.
- Balances change only from `GET /wallet/assets` or `balance.updated` (highest `version` wins), never from client arithmetic.
- A deposit is "credited" only when the backend reports `COMPLETED`.
- Features the backend lacks (withdrawals, market buy, email login, 2FA, sessions list, API keys, server-side preferences) are shown as not available.
