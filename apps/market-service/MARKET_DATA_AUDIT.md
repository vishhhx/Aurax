# Market-Data Broadcasting — Audit (2026-10-26)

Scope: Matching Engine → Kafka → Market Service → Kafka → WebSocket gateway → clients,
plus private user events. Builds on `AUDIT.md` (market-service completion, 2026-10-25).

## Existing implementations

| Area | Where | State |
|------|-------|-------|
| Engine events | `apps/engine/src/producers/order.ts` | `trade.executed` → `trade.executed`; `orderbook.updated` (full book snapshot, per-symbol `sequenceNumber` +1 per publish) → `market.events`; `order.completed/rejected/cancelled` → `order.events`. Key = symbol (trades/book), orderId (order events). |
| Order accepted | `apps/order-service/src/producer/order.producer.ts` | `order.created` (full order row, key = userId) → `order.events` |
| Deposits | wallet/order-service → `deposit.events` | `deposit.completed` consumed by the gateway |
| Market Service publication | `apps/market-service/src/producers/*`, `processors/*` | `market.trade`, `market.ticker`, `market.depth` (top-N full snapshot), `market.candle` (v1) on `market.events`, key = symbol, GZIP, acks=-1; durable trade dedupe in `MarketTrade` |
| Ticker / candles | `processors/tickers.ts`, `processors/candle.ts` | rolling 24h ticker, 5 intervals, dirty-revision persistence — reused unchanged |
| Gateway | `apps/websockets` | socket.io 4.8, JWT handshake (`extractSocketToken`), deposit consumer, v1 market hub (`market:subscribe`), per-instance consumer group |
| Frontend | `apps/web/lib/socket.ts` | socket.io-client, `withCredentials`, websocket transport; no market/user event handlers yet |

## Missing

1. Envelope with `eventId`, `type` (`depth.updated` / `trades.updated` / `ticker.updated` / `candles.updated`), `sequenceNumber`, `timestamp`, `data`.
2. Incremental depth (only full snapshots existed) with a gap-detectable sequence chain, plus resync.
3. Gateway-side book mirror, gap detection and authoritative resync (market-service REST snapshot).
4. Action-style client protocol (`{ action, channel, symbol, interval }`), `BTC-USDT` symbol form, known-symbol validation.
5. Private user channel (orders, user trades) bound to the authenticated identity.
6. Gateway consumer supervision (restart after non-retriable crash), graceful shutdown, consumer-group cleanup.
7. Ticker coalescing; reliable (non-volatile) delivery for incremental depth.
8. Tests with a real socket.io client; isolated end-to-end run.

## Bugs / inconsistencies

| # | Finding | Action |
|---|---------|--------|
| G1 | Browser sockets cannot authenticate: frontend sends cookies; `extractSocketToken` only reads `auth.token` / `Authorization`, while HTTP auth already accepts the `accessToken` cookie. | Fix: same cookie fallback for sockets (`@repo/core/jwt`). |
| G2 | Deposit socket registry: `add("socket:<userId>")` vs `get/remove("<userId>")`; disconnect uses `authUser.id` (undefined). Deposit pushes never arrive. | Fix (two-line integration bug, behaviour otherwise preserved). |
| G3 | Socket-ID registry in Redis + `io.to(socketId)` only works for sockets on the same instance. | Private market/order events use per-user rooms on every instance instead (each instance consumes all events). Deposit path kept, documented. |
| G4 | v1 depth used volatile emits; acceptable for full snapshots, **not** for deltas. | Deltas reliable; slow clients disconnected by bounded-buffer sweep. |
| G5 | Kafka brokers hard-coded to `localhost:9092` in `@repo/kafka`. | `KAFKA_BROKERS` env (default unchanged) — needed for isolated testing and any real deployment. |
| G6 | Gateway `PORT=5004` equals api-gateway `PORT=5004`. | Reported. |
| G7 | No "order partially filled" / "balance changed" events exist upstream; `order.completed` carries FILLED/PARTIALLY_FILLED. | Forward what exists; reported. |

## Files to modify

- `packages/kafka/src/client.ts` (brokers env), `packages/core/src/jwt.ts` (cookie token)
- market-service: `types/events.ts`, `producers/market.ts`, `producers/candle.ts`, `processors/orderbook-sync.ts`, `processors/trade-pipeline.ts`, `workers/market-timers.ts`, `server.ts`, tests, docs
- websockets: `src/market/*` (rewrite hub), new `src/private/*`, `src/server.ts`, `src/handlers/connection.handlers.ts`, `src/config/env.ts`, tests, `.env.example`

## Plan

1. v2 envelope + deterministic `eventId`s; depth as `snapshot` | `delta` with `prevSequenceNumber` chaining; periodic and post-failure snapshots.
2. Gateway: validated envelope consumer → per-symbol depth mirror (gap ⇒ unsynced ⇒ REST resync with Kafka buffering) → room routing; ticker coalescing; action protocol; limits.
3. Private: per-instance consumers of `order.events` / `trade.executed`; per-user rooms; per-party trade views.
4. Supervision, shutdown, metrics/logs; tests; isolated e2e (own Kafka + Postgres containers).

## Result (2026-10-26)

Implemented as planned. Verification:

- Unit/integration: market-service `bun test` 75 pass (+2 real-Postgres), websockets `bun test` 34 pass
  (real socket.io server + clients; private isolation; reconnect supervision).
- Isolated end-to-end (throwaway Kafka/Postgres/Redis containers, real market-service and gateway,
  real socket.io clients, engine role played by a fake gRPC server + engine-format Kafka events):
  depth snapshot→delta chain, trades, ticker, 1m candles, private order/trade events to the right
  users only, REST resync after a gateway restart mid-stream, engine sequence regression,
  per-instance consumer-group cleanup on shutdown. Containers removed afterwards.
- **Not** verified: submitting an order through order-service and the real matching engine
  (engine needs S3; order-service has the X1/X2 topic/group bugs), and the frontend UI (it does
  not consume the gateway yet).
