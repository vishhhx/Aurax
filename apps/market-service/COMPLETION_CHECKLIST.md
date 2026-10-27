# Market Service — Completion Checklist

Legend: `[x]` implemented **and** verified · `[ ]` incomplete · `[!]` blocker / needs a decision outside this service.
Verification column refers to the test files under `test/`, the real-Postgres
suite (`RUN_DB_TESTS=1`), and the e2e run (fake engine gRPC + real Kafka +
real Postgres, 2026-10-25).

## A. Architecture and startup

- [x] Service boundaries verified (engine matches; market-service derives, persists, publishes) — AUDIT.md
- [x] Env validation (zod; fails fast with all issues listed) — `src/config/env.ts`, e2e
- [x] Postgres, Kafka, gRPC connections verified; MongoDB and Redis removed (never used) — e2e
- [x] Startup ordering & readiness: registry → producer → HTTP (live) → engine LIVE → books → reconstruction → consumers → ready — e2e (503 before ready, 200 after)
- [x] Market state initialised before dependent requests (readiness gate returns 503) — `rest.test.ts`, e2e
- [x] Startup failures logged and exit non-zero; transient Kafka start errors retried (bounded) — e2e (observed and fixed)
- [x] Graceful shutdown: HTTP → consumers → timers → final candle flush → producer → gRPC → Postgres, with forced-exit timeout — e2e (all steps logged)
- [x] Unnecessary connections removed (MongoDB, Redis); unused deps pruned
- [x] Env vars and startup dependencies documented — README.md

## B. Kafka consumers and producers

- [x] Consumers/producers audited against real engine contracts (`maker`/`taker`, full-snapshot book) — `types/engine-events.ts`
- [x] `src/producers/market.ts` — trade/ticker/depth builders + batched publisher — `producer.test.ts`
- [x] `src/producers/candle.ts` (was a duplicate aggregator; replaced) — `producer.test.ts`
- [x] Shared `@repo/kafka` producer, `TOPICS`, connect/disconnect lifecycle
- [x] Trade events consumed and processed correctly — `trade-pipeline.test.ts`, `integration.test.ts`
- [x] Order-book snapshots consumed and applied — `orderbook.test.ts`, e2e via real Kafka
- [x] Derived events for trades, tickers, depth, candles (incl. candle close and ticker expiry) — `trade-pipeline.test.ts`, `candle.test.ts`
- [x] Correct topic constants; key = symbol — `producer.test.ts`
- [x] GZIP + `acks: -1`, matching the engine — `producer.test.ts`
- [x] Payload validation; malformed messages skipped, not retried forever — `consumer.test.ts`, e2e (garbage message counted and skipped)
- [x] Bounded dedupe: Postgres `MarketTrade` PK (durable) + bounded in-memory sets
- [x] Publish failures → retry via redelivery without re-aggregation; transient errors not committed — `trade-pipeline.test.ts`
- [x] Redelivery cannot double-count trades or candle volume (incl. across restarts) — `integration.test.ts` (restart case)
- [x] Partition ordering: per-symbol keys; one partition per symbol for both inputs and outputs
- [x] Contract changes documented (consumer group IDs changed; topics unchanged) — README.md, MARKET_DATA_PROTOCOL.md

## C. Order-book management

- [x] Existing implementation inspected
- [x] Duplicate stores (`marketsStore` / `marketOrderBookStore`) merged into one `OrderBookStore`
- [x] Init, consumer, REST and depth publishing share the same store (`market/state.ts`)
- [x] Symbols, levels, quantities, sequence numbers validated; crossed/duplicate books rejected — `orderbook.test.ts`
- [x] Decimal precision preserved end to end (strings; engine floats incl. `1e-7` normalised) — e2e
- [x] Stale snapshots ignored (sequence + Kafka offset) — `orderbook.test.ts`
- [x] Sequence gaps detected and counted (no recovery needed: full-snapshot protocol)
- [x] Resync from authoritative gRPC snapshot on sequence regression (engine restart) — `orderbook.test.ts`
- [x] Per-symbol serialisation so resync and Kafka updates cannot interleave
- [x] Bids descending / asks ascending enforced with exact comparison — `orderbook.test.ts`
- [x] Initialisation and recovery after market-service restart (gRPC seed) — e2e
- [x] Public depth limit 1–500 (default 20); published depth = `DEPTH_PUBLISH_LEVELS` — `rest.test.ts`

## D. Trade processing and recent trades

- [x] `trade.executed` contract verified against the engine
- [x] IDs, symbols, timestamps, price and quantity validated — `consumer.test.ts`
- [x] Dedupe and replay behaviour — `trade-pipeline.test.ts`, `integration.test.ts`
- [x] `recentTradesStore` integrated with the consumer and reconstruction
- [x] Bounded retention (`RECENT_TRADES_PER_MARKET`)
- [x] Deterministic ordering (timestamp, tradeId) — `integration.test.ts`
- [x] Recent-trades endpoint — `rest.test.ts`
- [x] Historical-trades endpoint (MarketTrade, keyset cursor) — `rest.test.ts`, `db.test.ts`
- [x] Trade-by-ID endpoint — `rest.test.ts`, `db.test.ts`
- [x] Aggregate trades: **removed** (float sums, undefined semantics) — not reintroduced
- [x] Trade count endpoint: **removed** (not needed; scanned per-user rows)
- [x] Deterministic pagination + index `MarketTrade(symbol, executedAt DESC, tradeId DESC)` — `db.test.ts`
- [x] No private data exposed (no userId/orderId/fees) — `trade-pipeline.test.ts`
- [x] `side` semantics verified: public `side` = taker side (per-user `Trade.side` is each user's own side)

## E. Ticker aggregation

- [x] Store and aggregator work together — `ticker.test.ts`
- [x] Last, open, high, low, change — `ticker.test.ts`
- [x] Percent change incl. zero/missing open (null) — `decimal.test.ts`, `ticker.test.ts`
- [x] Rolling 24h base/quote volume, exact — `ticker.test.ts`
- [x] Window semantics defined (`now − 24h < t`, engine time; open = earliest in window) — `processors/tickers.ts`
- [x] Duplicate and out-of-order trades — `ticker.test.ts`
- [x] Incremental: running sums, binary insertion, high/low rescan only when an extreme expires
- [x] Exact decimal arithmetic (bigint, 18 dp)
- [x] Reconstruction from MarketTrade on restart — `integration.test.ts`
- [x] Missing history defined: ticker starts from first recorded MarketTrade (documented)
- [x] Publish only on change (trade or window expiry) — `ticker.test.ts`
- [x] Ticker REST endpoints (also fixes the old `bigint` JSON crash) — `rest.test.ts`

## F. Candles and historical market data

- [x] Processor and intervals audited (1m, 5m, 15m, 1h, 1d)
- [x] Open-time / boundaries — `candle.test.ts`
- [x] OHLC — `candle.test.ts`
- [x] Base/quote volume and trade count — `candle.test.ts`
- [x] Out-of-order and duplicate trades — `candle.test.ts`
- [x] Closure and late-trade behaviour defined (closed candles can be revised; re-published) — `candle.test.ts`
- [x] Dirty tracking and revision handling — `candle.test.ts`, `persistence.test.ts`
- [x] Persistence worker completed (was wired to a duplicate aggregator) — `persistence.test.ts`
- [x] Uses the real `@@unique([symbol, interval, openTime])`; new `tradeCount` column via migration — `db.test.ts`
- [x] Failures retried with backoff; nothing acknowledged unless written — `persistence.test.ts`
- [x] Older revisions can never overwrite newer (SQL guard on `tradeCount`) — `db.test.ts`
- [x] Reconstruction after restart, aligned to the UTC day so rebuilt candles are complete — `integration.test.ts`
- [x] Candle REST endpoint (DB + memory merge) — `rest.test.ts`
- [x] Interval/limit/range validation — `rest.test.ts`
- [x] Precision preserved in persistence/serialisation (incl. Prisma `Decimal` exponent output) — `db.test.ts`
- [x] Candle producer integration — `producer.test.ts`

## G. REST API and routing

- [x] All controllers and routes audited
- [x] Market listing and metadata
- [x] Order-book depth
- [x] Ticker / 24h stats
- [x] Recent and historical trades
- [x] Candles
- [x] Price and best bid/ask
- [x] Market status — defined as DB `Market.status` + local data availability
- [x] Validation of symbols, limits, intervals, timestamps, cursors, duplicated params — `rest.test.ts`
- [x] Consistent `ApiReponse` shape and status codes; error middleware added
- [x] `ApiReponse` / `asyncHandler` conventions used
- [x] Unknown markets → 404; data not loaded → 503 — `rest.test.ts`
- [x] No DB internals leaked (generic 500) — `rest.test.ts`
- [x] Route ordering/mounting verified (single router; gateway strips `/api/v1/market`)
- [x] Every endpoint tested — `rest.test.ts`

## H. WebSocket market-data delivery

- [x] Existing socket infrastructure audited (`apps/websockets`, socket.io)
- [x] Delivery placed in the existing gateway, not a second server
- [x] Typed, versioned subscription protocol — MARKET_DATA_PROTOCOL.md, `websockets/src/market/hub.ts`
- [x] Subscribe / unsubscribe per symbol and channel — `websockets/test/hub.test.ts`
- [x] Initial snapshots then updates — `hub.test.ts`
- [x] Trades, tickers, depth, candles — `hub.test.ts`
- [x] Snapshot/update ordering defined — MARKET_DATA_PROTOCOL.md
- [x] Subscriptions validated and capped (25/request, 25/connection) — `hub.test.ts`
- [x] Disconnect cleanup; volatile emits for superseding channels; slow-client disconnect sweep
- [x] Room-scoped emits only (no global broadcast) — `hub.test.ts`
- [x] Heartbeat configured (socket.io ping 25 s / timeout 20 s)
- [x] Contracts documented — MARKET_DATA_PROTOCOL.md
- [x] Verified with real socket.io clients against a running gateway (isolated e2e, 2026-10-26; see MARKET_DATA_AUDIT.md)
- [x] v2 envelope, depth snapshot/delta chain, gateway depth mirror + REST resync, private user channel (2026-10-26)
- [!] Anonymous public market data: gateway auth middleware rejects unauthenticated sockets. Product/security decision required.

## I. Persistence and recovery

- [x] Source of truth per data type identified — README.md
- [x] Indexes verified/added (`MarketTrade` composite; existing `Candle` composite)
- [x] Ticker and candle recovery after restart — `integration.test.ts`
- [x] Order-book restoration and sequence continuity (gRPC seed + regression resync)
- [x] Kafka offsets vs state: offsets commit only after the trade is durable in MarketTrade (at-least-once input, idempotent effect)
- [x] Crash windows analysed (see final report: derived events for one trade can be lost; state is not)
- [x] Outbox evaluated: not added — derived events are superseding market data and state is rebuildable; documented
- [x] No exactly-once claims; semantics documented as at-least-once with idempotent effects
- [x] DB failures block (retry) rather than corrupt state — `trade-pipeline.test.ts`
- [ ] Retention policy for persisted history (MarketTrade/Candle grow unbounded; no pruning job) — needs a product decision

## J. Reliability, security and observability

- [x] Structured logs for consumer/producer failures (pino)
- [x] Metrics: lag, failures, throughput, latency, dirty candles, gaps — `/metrics` (Prometheus text)
- [x] Liveness and readiness with correct semantics — `rest.test.ts`
- [x] No credentials or user data logged
- [x] All external inputs validated (Kafka, gRPC, REST)
- [x] Bounded timeouts/retries (gRPC deadlines, engine wait backoff, consumer start retries, persistence backoff)
- [x] Unhandled rejections handled and logged
- [x] Bounded maps/queues/dedupe structures
- [x] No non-public routes exist (all read-only market data); `/metrics` is public through the gateway — see report
- [!] Rate limiting: none in the API gateway and none possible per-IP here behind the proxy — gateway change required

## K. Testing and verification

- [x] Order-book unit tests — `orderbook.test.ts`
- [x] Trade processing and dedupe — `trade-pipeline.test.ts`
- [x] Ticker calculations and windows — `ticker.test.ts`
- [x] Candle calculations and boundaries — `candle.test.ts`
- [x] Producer topic/key/compression/acks/payload — `producer.test.ts`
- [x] Consumer invalid messages and retries — `consumer.test.ts`
- [x] Candle upserts and dirty revisions — `persistence.test.ts`, `db.test.ts`
- [x] REST success, validation, missing markets, unavailable data — `rest.test.ts`
- [x] Engine events → market-service integration — `integration.test.ts`, e2e via real Kafka (order book)
- [x] Duplicates, out-of-order, restarts — `integration.test.ts`; Kafka-outage path covered by retry tests (no broker kill test)
- [x] TypeScript checks and tests run — see final report
- [x] Checks not run are reported (lint: no config/script; real trade path via live engine; socket client)

## Cross-service blockers (outside market-service, not changed)

- [!] **X1** Order Service consumes `trade.executed` from `order.events`; the engine publishes it on `trade.executed`. Per-user `Trade` rows / balances are never settled.
- [!] **X2** Engine and Order Service share consumer group `order.events`, splitting that topic between them.
- [!] **X3** `@repo/grpc` server binds `WALLET_GRPC_URL` for every service (engine included).
- [!] **X4** Default `PORT=5003` shared by market-service, order-service and websockets; api-gateway has no `MARKET_SERVICE_URL`.
- [x] **X5** fixed 2026-10-26 (registry key and disconnect user ID).
