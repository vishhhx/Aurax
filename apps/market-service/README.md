# Market Service

Consumes matching-engine events, maintains public market data (order books,
tickers, trades, candles), persists derived history, and publishes market-data
events for the socket gateway. It does not match orders.

## Event flow

```
Matching Engine ──trade.executed──────────────▶ trades consumer ──▶ MarketTrade (insert-if-absent)
      │                                                               │ new only
      │                                                               ▼
      │                                          ticker · candles · recent trades (memory)
      │                                                               │
      ├──orderbook.updated (market.events)──▶ orderbook consumer ──▶ OrderBookStore
      │                                                               │
      └──gRPC GetOrderBook / GetEngineStatus ◀── startup + resync     │
                                                                      ▼
                         depth.updated · trades.updated · ticker.updated · candles.updated (v2)
                                              (market.events, key = symbol)
                                                          │
                          ┌───────────────────────────────┴───────────────┐
                          ▼                                               ▼
              websockets gateway (rooms per symbol/channel)     Candle table (worker, 5s)
```

REST is served from the in-memory state (order book, ticker, recent trades,
current candles) and Postgres (market metadata, trade history, older candles).

## Sources of truth

| Data | Source of truth | Rebuilt on restart from |
|------|-----------------|-------------------------|
| Order book | Matching engine | gRPC `GetOrderBook`, then Kafka snapshots |
| Public trades | `MarketTrade` (one row per engine execution) | — |
| Ticker (rolling 24h) | derived | `MarketTrade` |
| Candles | derived; persisted to `Candle` | `MarketTrade` since the UTC day boundary ≤ now−24h |
| Recent trades | derived | `MarketTrade` |
| Market metadata | `Market` table | Postgres (refreshed every 60 s) |

## Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PG_DATABASE_URL` | yes | — | Postgres |
| `ORDER_GRPC_URL` | yes | — | Matching-engine gRPC (`host:port`) |
| `MARKETS` | yes | — | Comma-separated symbols served; each must be enabled in `Market` |
| `PORT` | no | `5004` | HTTP port |
| `NODE_ENV` | no | `development` | |
| `KAFKA_GROUP_PREFIX` | no | `market-service` | Consumer groups `<prefix>.trades`, `<prefix>.orderbook` |
| `KAFKA_TRADES_FROM_BEGINNING` | no | `true` | New trades group replays the retained log (deduped by MarketTrade) |
| `GRPC_TIMEOUT_MS` | no | `5000` | Per-call gRPC deadline |
| `ENGINE_READY_TIMEOUT_MS` | no | `0` (wait forever) | Startup wait for engine `LIVE` |
| `DEPTH_PUBLISH_LEVELS` | no | `50` | Levels per side in `depth.updated` (max 500 = REST limit) |
| `DEPTH_SNAPSHOT_INTERVAL_MS` | no | `30000` | Periodic full depth snapshot per symbol |
| `KAFKA_BROKERS` | no | `localhost:9092` | Comma-separated brokers (read by `@repo/kafka`) |
| `RECENT_TRADES_PER_MARKET` | no | `100` | In-memory recent trades |
| `CANDLE_PERSIST_INTERVAL_MS` | no | `5000` | Candle flush interval |
| `REPLAY_PUBLISH_MAX_AGE_MS` | no | `60000` | Older trades update state but are not re-broadcast |
| `SHUTDOWN_TIMEOUT_MS` | no | `15000` | Forced exit after this |

Kafka brokers come from `@repo/kafka` (`KAFKA_BROKERS`).
Topics: consumes `trade.executed`, `market.events` (`orderbook.updated`);
produces `market.events` (`depth.updated`, `trades.updated`, `ticker.updated`, `candles.updated`, schema v2). MongoDB and Redis are **not** used.

Startup dependencies, in order: Postgres → Kafka → matching engine (LIVE).
The HTTP server starts after Kafka; `/health/live` is 200 immediately,
`/health/ready` and every data route return 503 until state is initialised.

## REST (behind the gateway at `/api/v1/market`)

| Route | Source |
|-------|--------|
| `GET /health`, `/health/live`, `/health/ready`, `/metrics` | process |
| `GET /markets`, `/markets/:symbol`, `/markets/:symbol/status` | registry (Postgres) |
| `GET /markets/:symbol/orderbook?limit=1..500` | memory |
| `GET /markets/:symbol/bookTicker` | memory |
| `GET /tickers`, `/markets/:symbol/ticker` (alias `/ticker/24hr`), `/markets/:symbol/price` | memory |
| `GET /markets/:symbol/trades?limit` | memory (newest first) |
| `GET /markets/:symbol/historical-trades?limit=1..1000&startTime&endTime&cursor` | MarketTrade, keyset pagination |
| `GET /markets/:symbol/trades/:tradeId` | MarketTrade |
| `GET /markets/:symbol/candles?interval&limit=1..1000&startTime&endTime` | Candle table + memory |

Responses use `ApiReponse { success, data, message, statusCode? }`. 400 invalid
input, 404 unknown market/trade/route, 503 not ready / data not loaded, 500
generic (details are logged, never returned).

## Scripts

```bash
bun run dev           # watch mode
bun run start         # run
bun run check-types   # tsc --noEmit (also `build`)
bun test              # unit + integration (no broker needed)
RUN_DB_TESTS=1 bun test test/db.test.ts   # real Postgres, self-cleaning
```

See `MARKET_DATA_PROTOCOL.md` for event and WebSocket contracts, `AUDIT.md`
for the pre-completion audit, and `COMPLETION_CHECKLIST.md` for status.
