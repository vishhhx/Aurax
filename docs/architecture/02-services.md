# 2. Services

Each section covers: what the service is for, what it owns, what it does not
do, how its code is laid out, and how it starts.

| Service | Owns | Talks to |
|---|---|---|
| [api-gateway](#api-gateway) | nothing (stateless) | all HTTP services |
| [auth-service](#auth-service) | users (Mongo), sessions (Redis) | Google, GitHub |
| [wallet-service](#wallet-service) | wallets, reservations, deposits, ledger | Razorpay, Kafka |
| [order-service](#order-service) | orders, fills, settlement | wallet gRPC, Kafka |
| [engine](#engine) | the live order book (memory) | Kafka, S3/fs |
| [market-service](#market-service) | public trades, candles, tickers, book mirror | engine gRPC, Kafka |
| [websockets](#websockets) | live socket connections | Kafka, market-service |
| [web](#web) | UI state | gateway, websockets, Razorpay |
| [trading-bots](#trading-bots) | nothing | gateway, websockets |

---

## api-gateway

`apps/api-gateway` · port 5000

**Job:** the single REST entry point. It handles CORS, rate limits, and
proxies requests to the right service.

```
/api/v1/auth/*    → AUTH_SERVICE_URL
/api/v1/wallet/*  → WALLET_SERVICE_URL   (writes rate-limited)
/api/v1/order/*   → ORDER_SERVICE_URL    (writes rate-limited)
/api/v1/market/*  → MARKET_SERVICE_URL
/health
```

How it works (`src/app.ts`, `src/proxy/proxy.ts`):

- **CORS** allows `CORS_ORIGINS` with credentials, so the browser can send the
  `accessToken` cookie. It exposes `RateLimit-*` and `Retry-After` headers.
- **Rate limits** (`src/middleware/rateLimiter.ts`) are fixed one-minute
  windows per IP, kept in memory: 600 requests/min for everything
  (`RATE_LIMIT_PER_MIN`), plus 120 non-GET requests/min on wallet and order
  (`WRITE_RATE_LIMIT_PER_MIN`). Over the limit you get `429` with
  `Retry-After`.
- **Dev bot bypass:** outside production, a request with a valid JWT whose
  email ends in `@bots.aurax.dev` skips rate limits, because all bots share
  one IP.
- **Proxy:** Express strips the mount path, so `/api/v1/order/abc` arrives at
  order-service as `/abc`. A timeout (`UPSTREAM_TIMEOUT_MS`, 10s) or a dead
  upstream returns JSON `504` or `502` instead of a hanging request.
- Query strings are not logged, because the OAuth callback carries a `code`.

**Does not:** verify JWTs, hold state, or talk to Kafka.

---

## auth-service

`apps/auth-service` · port 5001 · MongoDB + Redis

**Job:** sign users in with OAuth and manage their sessions.

| Route (behind `/api/v1/auth`) | What it does |
|---|---|
| `GET /oauth2/google`, `GET /oauth2/github` | Create OAuth `state`, redirect to provider |
| `GET /oauth2/{google,github}/callback` | Verify state, exchange code, upsert user, set cookies, redirect to `FRONTEND_URL/auth/success` |
| `POST /sessions/refresh` | Rotate tokens using the refresh cookie |
| `POST /sessions/logout` | Delete the refresh session, clear cookies |
| `GET /details` (alias `/user-details`) | Current user's profile |

Tokens (`src/utils/auth-tokens.ts`, `packages/core/src/jwt.ts`):

- **Access token:** JWT with `{ userId, name, email }`, valid 15 minutes,
  signed with `JWT_ACCESS_SECRET`. Each token has a random `jti`.
- **Refresh token:** JWT valid 30 days, signed with `JWT_REFRESH_SECRET`.
  It is also stored in Redis as `session:<refreshToken>` (30-day TTL) with
  device id, IP and user agent. Refresh deletes the old session and creates a
  new one, so a refresh token works only once.
- Both are sent as `HttpOnly`, `SameSite=Lax` cookies (`Secure` in
  production).
- **OAuth state** is stored in Redis as `oauth:<provider>:<state>` with a
  5-minute TTL and in a cookie. The callback checks and deletes it, which
  blocks CSRF and replay.

**Does not:** know about balances or trading.

---

## wallet-service

`apps/wallet-service` · HTTP 5002 · gRPC 8002 · Postgres

**Job:** owns user balances. It reserves and releases funds for orders, and it
credits Razorpay deposits.

HTTP routes (behind `/api/v1/wallet`, all need auth except the webhook):

| Route | What it does |
|---|---|
| `GET /assets` | Assets plus the user's available/locked balance |
| `GET /deposits`, `GET /deposits/:depositId` | Deposit history |
| `GET /ledger` | Ledger history |
| `GET /payment/razorpay/quote?amount=` | INR → USDC quote (`USDC_INR_RATE`, rounded down to 8 dp) |
| `POST /payment/razorpay/init-deposit` | Create a `PENDING` Deposit and a Razorpay order |
| `POST /payment/razorpay/verify` | Check the client-side signature, move to `CONFIRMING` (no credit) |
| `POST /webhook/razorpay` | Signed webhook. **The only place funds are credited.** Mounted before the JSON parser and auth so it gets the raw body |

gRPC (`packages/grpc/proto/wallet.proto`, `src/grpc/handlers/wallet.ts`):

- `ReserveBalance(user_id, asset_symbol, amount, reference_id)`: moves funds
  from `availableBalance` to `lockedBalance` with **one conditional UPDATE**
  (`WHERE availableBalance >= amount`), creates a `BalanceReservation`, and
  writes a `balance.updated` outbox event. The same `reference_id` with the
  same parameters returns the existing reservation (idempotent). Error codes:
  `INVALID_AMOUNT`, `WALLET_NOT_FOUND`, `INSUFFICIENT_BALANCE`,
  `DUPLICATE_REFERENCE`.
  *Note:* the field is named `asset_symbol` but carries the **assetId**.
- `ReleaseBalance(reference_id)`: gives back an ACTIVE reservation. It refuses
  (`ORDER_EXISTS`) if an order was created with that reference, because that
  order's funds are released by settlement, not by this call.

Errors are returned as `success: false` + `error_code`, not as gRPC errors.

Background: runs an `OutboxRelay` (see [Reliability](07-reliability.md)).

**Does not:** match orders or settle trades.

---

## order-service

`apps/order-service` · port 5003 · Postgres

**Job:** accept orders, send them to the engine, and **settle** what the engine
reports. It is the only service that applies fills to balances.

HTTP routes (behind `/api/v1/order`, all authenticated):

| Route | What it does |
|---|---|
| `POST /` | Place an order. Returns `202 Accepted` |
| `GET /?status=open\|closed\|all&symbol&limit&before` | The user's orders, newest first, keyset pagination |
| `GET /trades?symbol&limit&before` | The user's fills (with `liquidity: MAKER/TAKER`) |
| `GET /:orderId` | One order with its fills |
| `DELETE /:orderId` | Request cancel. Returns `202` |

Code layout:

```
src/
  schemas/order.schema.ts       zod: shape, LIMIT needs price, MARKET forbids it,
                                postOnly only LIMIT+GTC, MARKET+GTC → IOC
  services/order-rules.ts       market rules (tick/step/min/max/notional),
                                reservation amount
  lib/money.ts                  Decimal helpers, WALLET_SCALE = 8
  grpc/clients/wallet.ts        ReserveBalance / ReleaseBalance client
  repositories/order.repositorie.ts
                                createOrderWithCommand, requestCancel,
                                markOpened, closeOrder, executeTrade (settlement)
  consumers/order.consumer.ts   reads trade.executed, validates, dispatches
```

Startup (`src/server.ts`): connect Postgres → connect Kafka producer → start
`OutboxRelay` (if `OUTBOX_RELAY` is on) → start the `trade.executed` consumer
(group `order-service.execution-reports`) → listen on HTTP.

Shutdown: stop HTTP, disconnect the consumer, stop the relay (it does a final
flush), disconnect Kafka and Prisma. Hard exit after 15s.

**Does not:** match orders.

---

## engine

`apps/engine` · gRPC 8003 + 8004 · memory + S3/fs

**Job:** keep the order book and match orders. See the full deep dive in
[Matching engine](04-matching-engine.md).

```
src/
  index.ts                      supervisor: one child process per shard
  main.ts                       StartEngine: load markets, Kafka, gRPC, consume
  matching-engine/index.ts      MatchingEngine: matching, events, snapshots
  orderbook/orderbook.ts        OrderBook: bids/asks maps, FIFO price levels
  handlers/order.handlers.ts    validate commands, convert to engine orders
  consumers/order.consumer.ts   recovery + consume order.events
  persistence/recovery.ts       restore book from latest snapshot
  producers/order.ts            send to trade.executed / market.events
  grpc/handlers/                GetOrderBook, GetEngineStatus
  utils/s3.ts                   snapshot store (S3 or fs)
```

**Does not:** touch balances, write to Postgres, or serve HTTP.

---

## market-service

`apps/market-service` · port 5004 · Postgres + memory

**Job:** turn the engine's raw output into **public** market data, store it,
serve it over REST, and publish it to Kafka for the socket gateway.

REST (behind `/api/v1/market`, public):

```
GET /markets                         GET /markets/:symbol/ticker (and /ticker/24hr)
GET /tickers                         GET /markets/:symbol/bookTicker
GET /markets/:symbol                 GET /markets/:symbol/price
GET /markets/:symbol/status          GET /markets/:symbol/candles
GET /markets/:symbol/orderbook       GET /markets/:symbol/trades
GET /markets/:symbol/historical-trades
GET /markets/:symbol/trades/:tradeId
GET /health, /health/live, /health/ready, /metrics
```

Main parts:

| Part | File | What it does |
|---|---|---|
| Market registry | `market/registry.ts` | `MARKETS` env ∩ enabled markets in Postgres, refreshed every 60s |
| OrderBookSync | `processors/orderbook-sync.ts` | Mirrors the engine book from `orderbook.updated`, checks sequence numbers, reloads from gRPC on regression, publishes depth snapshot/delta |
| TradePipeline | `processors/trade-pipeline.ts` | `MarketTrade` insert-if-absent, then updates recent trades, ticker and candles, then publishes |
| Tickers / candles | `processors/tickers.ts`, `processors/candle.ts` | Rolling 24h ticker; OHLCV for 1m, 5m, 15m, 1h, 1d |
| CandlePersistenceWorker | `workers/candle-persistence.ts` | Upserts changed candles to Postgres every `CANDLE_PERSIST_INTERVAL_MS` (5s) |
| MarketTimers | `workers/market-timers.ts` | Ticker expiry (5s), candle close (1s), registry refresh (60s), full depth snapshot (`DEPTH_SNAPSHOT_INTERVAL_MS`, 30s) |

Startup order (`src/server.ts`):

1. Connect Postgres.
2. Load the market registry.
3. Connect the Kafka producer.
4. Start HTTP. Data routes return `503` until ready.
5. **Wait for the engine to say `LIVE`** (gRPC `GetEngineStatus`, backoff 1s →
   10s), then load each book with `GetOrderBook`.
6. Rebuild tickers, candles and recent trades from `MarketTrade`.
7. Start the Kafka consumers (`market-service.trades` on `trade.executed`,
   `market-service.orderbook` on `market.events`), then the worker and timers.
   Now ready.

Trades older than `REPLAY_PUBLISH_MAX_AGE_MS` (60s) when consumed update state
but are not re-broadcast, so a replay of history does not flood clients.

**Does not:** serve any private data.

---

## websockets

`apps/websockets` · port 5005

**Job:** push live data to browsers. It only reads from Kafka. It never accepts
writes.

```
src/
  server.ts                    express (/health, /metrics) + socket.io server
  gateway.ts                   auth on connect, join user room, "session" event
  market/hub.ts                MarketHub: rooms, caches, snapshots for new subscribers
  market/depth-mirror.ts       per-symbol depth with sequence checks and resync
  market/protocol.ts           zod schemas for Kafka input and client messages
  market/market-data.ts        market.events consumer → hub
  private/user-events.ts       private consumers → user:<id> rooms
  kafka/supervised-consumer.ts consumer that restarts itself on crash
```

- **Public channels:** `depth`, `trades`, `ticker`, `candles`. Clients
  subscribe on the socket event `market`. Up to
  `MAX_SUBSCRIPTIONS_PER_SOCKET` (50) per socket. Ticker updates are
  coalesced every 250 ms.
- **Private events:** sent on the socket event `user` to room
  `user:<userId>`. The room is chosen from the **verified token only**.
- **Per-instance consumer groups** (`websockets.<stream>.<INSTANCE_ID>`). Each
  instance must see every event, because a user can be connected to any
  instance. Groups are deleted on graceful shutdown.
- socket.io heartbeat: ping every 25s, drop after 20s of silence. Max
  inbound message size 64 KB.

Details are in [Communication](03-communication.md#socketio-to-the-browser).

---

## web

`apps/web` · port 3000 · Next.js

The trading UI. See [Frontend](08-frontend.md).

---

## trading-bots

`apps/trading-bots` · dev only

Creates bot users (`*@bots.aurax.dev`) directly in Mongo/Postgres, funds them,
and runs market-maker and taker strategies through the **public** REST API and
socket. They go through the same code paths as a real user, so they are a good
end-to-end load test. They are excluded from `bun run dev` and must never run
in production. See [`apps/trading-bots/README.md`](../../apps/trading-bots/README.md).

---

## Shared packages

| Package | Used by | What it gives |
|---|---|---|
| `@repo/core` | all HTTP services, websockets | `ApiError`, `ApiReponse`, `asyncHandler`, `signToken`/`verifyToken`, `extractBearerToken`/`extractSocketToken`, `validateRequest` |
| `@repo/grpc` | wallet, order, engine, market | Proto loading, generated types, client and server helpers |
| `@repo/kafka` | all backend services | `kafka`, shared `producer`, `consumer(groupId)`, `TOPICS` |
| `@repo/pg` | wallet, order, engine, market, bots | Prisma client and enums, `enqueueOutbox`, `OutboxRelay`, `enqueueBalanceUpdates`, `reconcileWallets` |
| `@repo/mongodb` | auth, bots | Mongoose connection, `User` model |
| `@repo/redis` | auth | Redis client, `RedisString` and set helpers |
| `@repo/logger` | all | pino logger |
