# Market Service — Audit Report (2026-10-25)

Audit of `apps/market-service` before the completion work, traced against the
Matching Engine (`apps/engine`), Order Service (`apps/order-service`), the
websocket gateway (`apps/websockets`), and the shared packages
(`@repo/kafka`, `@repo/pg`, `@repo/grpc`, `@repo/core`).

## 1. Implemented (working as written)

- Express app with market, ticker, order-book, price, book-ticker and trade routes.
- gRPC client for `GetEngineStatus` / `GetOrderBook`; startup waits for the engine to be `LIVE`.
- `TickerAggregator` and `CandleAggregator` use exact 18-decimal `bigint` arithmetic.
- Candle dirty-revision tracking (`acknowledgePersisted` only clears the exact revision written).
- Candle persistence worker with a re-entrancy guard, using the real
  `@@unique([symbol, interval, openTime])` key.
- `RecentTradesStore` is bounded (100/market) and dedupes by trade ID.
- Producer uses the shared `@repo/kafka` producer, `acks: -1`, GZIP, key = symbol
  (same convention as the engine).

## 2. Partially implemented

- **Trade consumer**: parses `trade.executed`, but against a contract the engine does not send
  (top-level `side`, `sequenceNumber`); the real `maker`/`taker` objects are ignored, so `side` is
  always `null`.
- **Ticker**: correct maths, but recalculates and re-sorts the full 24h history on every trade, never
  expires the window without new trades, and reconstruction reads the wrong table semantics (below).
- **Candles**: aggregation is correct; persistence never runs (see bugs). No candle REST endpoint.
- **Order book**: stores snapshots and ignores stale sequences; no resync, no gap reporting, values
  converted to JS `number`.
- **Shutdown**: closes HTTP + candle worker + Prisma; Kafka consumers/producer are never disconnected.
- **REST**: endpoints exist, but there is no error middleware, so thrown errors become Express HTML
  500s; error responses put the message in `data`.

## 3. Missing

- Env validation; readiness/liveness semantics; metrics.
- Durable, replay-safe trade record for the market-data domain.
- Candle REST endpoint, candle close publication.
- WebSocket market-data delivery (the gateway only handles deposits).
- Tests (no test runner or test files exist).

## 4. Bugs and inconsistencies

| # | Severity | Finding |
|---|----------|---------|
| B1 | Critical | Two order-book stores: startup loads `marketsStore`, the Kafka consumer reads/writes `marketOrderBookStore`. REST serves the gRPC snapshot forever; live updates go to a store nothing reads. |
| B2 | Critical | `producers/candel.ts` is a full copy of `CandleAggregator`. The persistence worker imports the copy, the trade consumer feeds `processors/candel.ts`. No candle is ever persisted. |
| B3 | Critical | Because of B2 nothing is acknowledged, so the dirty map grows forever and **every** dirty candle is re-published on **every** trade. |
| B4 | High | Ticker reconstruction reads `Trade`, which has two rows per execution (`<id>-maker`, `<id>-taker`): volumes double-count, and IDs never match live engine IDs, so replay dedupe fails. `createdAt` is the DB insert time, not the execution time. |
| B5 | High | Kafka consumer group IDs equal topic names (`trade.executed`, `market.events`). Any other service consuming these topics with the shared helper would split partitions with market-service. |
| B6 | High | Any malformed message throws → kafkajs retries forever → the partition is blocked (poison pill). |
| B7 | High | Engine book sequence can move backwards after an engine restart (restored from an S3 snapshot taken every 100 events; RECOVERY replay does not advance it). The store would then drop every live update as "stale". |
| B8 | Medium | Engine prices/quantities are JS floats serialised with `toString()`; values such as `1e-7` are rejected by the decimal parser (→ B6). |
| B9 | Medium | MongoDB and Redis are connected at startup but never used. |
| B10 | Medium | `/markets/:symbol/aggregate-trades` sums with floating point and aggregates across unrelated orders; `trades/count` scans user rows. |
| B11 | Low | `healthCheck` always returns 200 regardless of readiness. |

### Cross-service findings (outside market-service; reported, not changed)

- **X1 (Critical)**: Order Service consumes `trade.executed` from `order.events`, but the engine publishes
  it to `trade.executed`. No `Trade` rows are written (the DB currently has 0 trades).
- **X2 (Critical)**: Engine and Order Service both consume `order.events` with group ID `order.events`, so
  Kafka splits the topic's partitions between them.
- **X3 (Medium)**: `@repo/grpc` `getGrpcServer()` always binds `WALLET_GRPC_URL`, including for the engine.
- **X4 (Low)**: `PORT=5003` is the default for market-service, order-service and websockets.
- **X5 (Low)**: websockets stores sockets under `socket:<userId>` but removes `<userId>`; all sockets require a JWT,
  so public market data cannot be streamed to anonymous users.

## 5. Required schema / shared-contract changes

- New table `MarketTrade` (one row per engine execution, unique engine trade ID, execution timestamp,
  aggressor side). Needed for replay-safe dedupe across restarts, ticker/candle reconstruction and public
  trade history without depending on per-user `Trade` rows (B4, X1).
- `Candle.tradeCount Int @default(0)` — used as a monotonic revision guard so an older write cannot
  overwrite a newer candle.
- No topic changes. Consumer group IDs change to `market-service.*` (offsets restart at latest; see report).

## 6. Dependencies between tasks

1. Decimal utilities + event contracts → everything else.
2. Single order-book store (B1) → consumers, REST, depth publishing.
3. `MarketTrade` migration → trade pipeline dedupe → ticker/candle reconstruction → trade history REST.
4. Single candle aggregator (B2) → persistence worker → candle REST → candle events.
5. Producers → websocket gateway market-data channel.
