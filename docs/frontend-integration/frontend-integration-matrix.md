# Frontend feature to backend matrix

Status labels:

| Label | Meaning |
|---|---|
| **Verified** | Implemented and verified by automated tests or isolated E2E (evidence column) |
| **Implemented** | Implemented but not verified end-to-end |
| **Partial** | Some of it exists; the gap is stated |
| **Missing** | No backend support; the UI must not pretend it works |
| **External** | Implemented, but full verification needs a third party (OAuth provider, Razorpay) |
| **N/A** | Purely client-side |

Evidence keys:
- **E2E**: `apps/order-service/test/e2e` (isolated Kafka and Postgres, 34/34 checks).
- **DB**: `apps/order-service/test/settlement.db.test.ts` (real Postgres).
- **WS**: `apps/websockets/test/*` (including the socket.io integration test).
- **MS**: `apps/market-service/test/*`.
- **AUTH**: `apps/auth-service/test/*`.

## Public / markets

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Market list with rules (tick, step, fees) | `GET /market/markets` | Verified | MS, E2E |
| Tickers for all markets (landing, explorer) | `GET /market/tickers` + WS `ticker` | Verified | MS, WS, E2E |
| Market detail / status (HALTED etc.) | `GET /market/markets/:s`, `/status` | Verified | MS |
| Search / filter / sort markets | client-side over `/markets` + `/tickers` | N/A | |
| Favourites / watchlist | none | Missing | store locally (clearly per-device) or add an API |
| Market logos | `Asset.imageUrl` via `/wallet/assets` (**auth required**) | Partial | no public asset endpoint; see missing-capabilities #8 |

## Trading terminal

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Candlestick chart (history) | `GET /market/markets/:s/candles` | Verified | MS |
| Live candle | WS `candles` + interval | Verified | WS, MS |
| Order book with gap resync | WS `depth` (snapshot/update/resync) + `GET …/orderbook?view=published` | Verified | WS hub tests, E2E gateway restart |
| Recent public trades | WS `trades` + `GET …/trades` | Verified | WS, MS |
| Older public trades | `GET …/historical-trades` (cursor) | Verified | MS |
| Best bid/ask, last price | `bookTicker`, `price`, WS ticker | Verified | MS |
| Place LIMIT order (GTC/IOC/FOK, post-only) | `POST /order` | Verified | DB, E2E A–D |
| Place MARKET **SELL** | `POST /order` | Verified | DB |
| Place MARKET **BUY** | rejected with 400 | Missing | engine has no quote budget; UI must disable it (missing-capabilities #5) |
| Stop / stop-limit / OCO / trailing | none | Missing | do not show |
| Pre-trade validation (tick/step/min notional) | rules from `/markets/:s`; server re-checks | Verified | unit (`order-rules.test.ts`) |
| Reservation preview (cost incl. fee) | client computes from rules: `price×qty×(1+max fee)` | N/A | server value returned as `reserved` |
| Available balance in the order form | `GET /wallet/assets` + WS `balance.updated` | Verified | E2E |
| Open orders (live) | `GET /order?status=open` + WS `user` order events | Verified | E2E |
| Cancel order | `DELETE /order/:id` → `order.cancelled` / `order.cancel_rejected` | Verified | E2E, DB |
| Cancel all | none (loop over `DELETE`) | Missing | client can iterate; no batch API |
| Amend order | none | Missing | cancel + new order |
| Order history (paged) | `GET /order?status=closed&before=` | Verified | DB (paging test) |
| Order detail with fills | `GET /order/:id` | Verified | E2E |
| My trade history (paged) | `GET /order/trades?before=` | Verified | DB (paging test) |
| Fill notifications / toasts | WS `user` `trade.executed`, `order.filled` | Verified | WS, E2E |

## Auth

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Google sign-in | `/auth/oauth2/google` + callback | External | state binding and failure redirect: AUTH; full flow needs real Google credentials |
| GitHub sign-in | `/auth/oauth2/github` + callback | External | as above |
| OAuth success landing | `/auth/success` (web) → `GET /auth/details` | Implemented | page exists |
| OAuth failure | 302 → `/login?error=auth_failed` | Verified | AUTH |
| Session refresh | `POST /auth/sessions/refresh` | Verified | AUTH (rotation, reuse rejected) |
| Logout | `POST /auth/sessions/logout` | Verified | AUTH (new endpoint) |
| Current user | `GET /auth/details` | Implemented | not covered by an automated test |
| Email/password register and login | none routed | Missing | forms must stay disabled with a notice |
| Forgot / reset password, email verification | none | Missing | |
| Socket auth (public + private) | cookie / `auth.token` | Verified | WS integration |

## Dashboard / wallet

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Balances (available / locked / total) | `GET /wallet/assets` | Verified | E2E |
| Live balance updates | WS `balance.updated` (highest `version` wins) | Verified | WS, E2E |
| Portfolio value in USD(C) | client: balance × ticker `lastPrice` of `<ASSET>USDC` | Partial | no valuation endpoint; assets without a USDC market cannot be valued |
| PnL / cost basis | none | Missing | derivable from trades but no API; do not invent |
| Balance movement history | `GET /wallet/ledger` | Verified | DB (new endpoint) |
| Allocation chart | client from balances + prices | N/A | |

## Deposits

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| INR → USDC deposit via Razorpay | `init-deposit` → Checkout → `verify` → webhook | External | webhook crediting: DB + E2E with signed fake webhooks; real Razorpay not exercised |
| Deposit status after checkout | `verify` response + `GET /wallet/deposits/:id` + WS `deposit.completed` | Verified | DB (new endpoint) |
| Deposit history | `GET /wallet/deposits` | Verified | DB (new endpoint) |
| Failed / abandoned deposit status | `FAILED` never set | Partial | stays `PENDING`; see missing-capabilities #3 |
| Crypto deposit address / on-chain deposits | none | Missing | do not show |
| Credited USDC and rate shown before paying | `GET /wallet/payment/razorpay/quote?amount=` | Verified | wallet unit test (new endpoint); rate is a configured indicative rate |

## Withdrawals

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Withdraw (fiat or crypto) | none | Missing | the spec says to build only if the backend supports it: **do not build the flow**; show it as unavailable |
| Withdrawal history / address book | none | Missing | |

## Settings / security

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Profile view | `GET /auth/details` | Implemented | |
| Profile edit | none | Missing | |
| 2FA / TOTP | none | Missing | |
| Active sessions / revoke others | Redis sessions exist, no API | Missing | |
| API keys | none | Missing | |
| Theme (dark/light) | client (`next-themes`) | N/A | |
| Notification preferences | none | Missing | |

## Cross-cutting

| Feature | Backend | Status | Evidence / notes |
|---|---|---|---|
| Typed API client, 401 → refresh → retry | contract in http-api.md | N/A | `apps/web/lib/axios.ts` |
| Rate limit handling | 429 + `Retry-After` (CORS-exposed) | Implemented | not load-tested |
| Upstream down | 502/504 JSON from gateway | Implemented | |
| Service health banner | `GET /health`, `/api/v1/market/health/ready` | Implemented | |
| Demo mode | removed with the simulator; fixtures live only in `apps/web/test` | N/A | never mixes with real data |
