# Market Data Protocol (v2)

```
Matching Engine ──trade.executed / orderbook.updated──▶ Market Service ──market.events (v2)──▶ WebSocket gateway ──"market"──▶ clients
                 └─order.events / trade.executed (private) ─────────────────────────────────▶ WebSocket gateway ──"user"───▶ owner only
```

All prices, quantities and volumes are **decimal strings** (≤ 18 fractional
digits, never exponent notation). Timestamps are Unix ms. Sequence numbers are
unsigned-integer **strings**, scoped **per symbol** (never global).

## 1. Kafka: `market.events` (market-service → gateway)

- Key = symbol → one partition per symbol, events in publish order.
- Headers: `event-type`, `event-id`, `schema-version` (`"2"`). Producer `acks=-1`, GZIP.
- Delivery is **at-least-once**. `eventId` is deterministic: drop duplicates by ID.
- The topic also carries the engine's raw `orderbook.updated`; filter on `type`.

```ts
{ eventId, type, schemaVersion: 2, symbol, sequenceNumber, timestamp, data }
```

| type | `sequenceNumber` | `eventId` | data |
|------|------------------|-----------|------|
| `depth.updated` | engine book sequence | `depth:<sym>:snapshot:<seq>` / `depth:<sym>:delta:<prev>:<seq>` | `{ kind: "snapshot", depth, bids, asks }` or `{ kind: "delta", depth, prevSequenceNumber, bids, asks }` |
| `trades.updated` | `null` | `trades:<sym>:<tradeId>` | `{ tradeId, price, quantity, quoteQuantity, side, isBuyerMaker, executedAt }` |
| `ticker.updated` | ticker revision (restarts with the service) | `ticker:<sym>:<boot>:<seq>` | `{ lastPrice, openPrice24h, priceChange24h, priceChangePercent24h, high24h, low24h, baseVolume24h, quoteVolume24h, tradeCount24h, lastTradeTimestamp, windowStart }` |
| `candles.updated` | candle revision (= tradeCount) | `candles:<sym>:<iv>:<openTime>:<rev>:<o\|c>` | `{ interval, openTime, closeTime, open, high, low, close, baseVolume, quoteVolume, tradeCount, isClosed }` |

### Depth: snapshots and deltas

- Depth is a **top-N view** (`depth` levels per side, `DEPTH_PUBLISH_LEVELS`, default 50),
  bids descending and asks ascending.
- One event per applied engine book state. A **delta** lists changed levels only
  (upsert; `"quantity": "0"` removes the level). Applying a delta to the previous
  view reproduces the new view exactly.
- A delta applies **only** if the consumer's current sequence equals
  `data.prevSequenceNumber`. A sequence ≤ current is a duplicate. Anything else is a **gap**.
- A **snapshot** is published on startup, after an engine resync (the engine
  sequence can go backwards when the engine restarts), after a failed publication,
  after 500 deltas, and every `DEPTH_SNAPSHOT_INTERVAL_MS` (default 30 s).
- Authoritative resync: `GET /markets/:symbol/orderbook?limit=<depth>` returns the
  same top-N view at its `sequenceNumber`. Buffer deltas while fetching, drop those
  with `sequenceNumber ≤ snapshot`, and require the first one applied to chain
  onto the snapshot.
- Engine price-time priority is untouched: market-service only mirrors engine state.

Trades are real executions from the engine's `trade.executed`; `side` is the taker
(aggressor) side. Candle intervals are `1m 5m 15m 1h 1d`, aligned to UTC.

## 2. WebSocket (socket.io gateway, `apps/websockets`)

> **Superseded:** the current client contract (anonymous access, the `session` event,
> private lifecycle and balance events) is [docs/frontend-integration/websocket-api.md](../../docs/frontend-integration/websocket-api.md).

Every connection authenticates with the existing access token, sent as handshake
`auth.token`, an `Authorization: Bearer` header, or the HttpOnly `accessToken`
cookie (browser `withCredentials`).

### Client → server: event `"market"` (ack callback optional)

```js
socket.emit("market", { action: "subscribe", channel: "depth", symbol: "BTC-USDC" }, (ack) => {});
socket.emit("market", { action: "subscribe", channel: "candles", symbol: "BTC-USDC", interval: "1m" });
socket.emit("market", { action: "unsubscribe", channel: "depth", symbol: "BTC-USDC" });
socket.emit("market", { action: "subscribe", subscriptions: [
  { channel: "ticker", symbol: "BTCUSDC" }, { channel: "trades", symbol: "BTCUSDC" } ] });
socket.emit("market", { action: "resync", channel: "depth", symbol: "BTCUSDC" }); // client detected a gap
// ack: { ok: true, action, keys: ["md:depth:BTCUSDC"] } | { ok: false, error }
// without an ack callback, errors arrive as { type: "error", error } on "market"
```

- Channels: `depth`, `trades`, `ticker`, `candles` (candles require `interval`).
- Symbols: `BTC-USDC`, `btc/usdc` and `BTCUSDC` are equivalent. Unknown markets are
  rejected once the gateway has loaded the market list from market-service.
- Limits: 25 items per request, 50 subscriptions per connection (`MAX_SUBSCRIPTIONS_PER_SOCKET`).
- A duplicate subscribe is idempotent: no second snapshot, no duplicate delivery.

### Server → client: event `"market"`

```ts
{ type: "snapshot", key, channel, symbol, interval?, sequenceNumber, data }
//   depth   → { sequenceNumber, depth, bids, asks }
//   ticker  → TickerData | null      trades → TradeData[] (newest first, ≤ 50)
//   candles → CandleData | null      (latest for that interval)
{ type: "update", key, channel, symbol, interval?, eventId, sequenceNumber, prevSequenceNumber?, timestamp, data }
//   depth data = { bids, asks } changed levels (quantity "0" = remove)
{ type: "resync", key, channel: "depth", symbol, reason }   // "awaiting_snapshot" | "sequence_gap"
{ type: "error", error }
```

Client depth algorithm:

1. On `snapshot`, replace the local book; `seq = sequenceNumber`.
2. On `update`, apply it if `prevSequenceNumber === seq` and set `seq = sequenceNumber`.
   Ignore it if `sequenceNumber ≤ seq`. Otherwise you have a gap: send
   `{ action: "resync" }` or resubscribe.
3. On `resync`, stop showing the book. A `snapshot` follows once the gateway is
   consistent again.

The gateway sends a subscriber's snapshot before joining it to the room, in the
same synchronous step, so no update can fall between the two.

Delivery: `depth`, `trades` and `candles` are reliable (never dropped). `ticker` is
coalesced to the latest value per symbol every `TICKER_COALESCE_MS` (250 ms) and
sent volatile. A client whose outbound buffer exceeds `SLOW_CLIENT_BUFFER_LIMIT`
messages is disconnected and should reconnect and resubscribe. Heartbeat: ping
every 25 s, timeout 20 s.

### Private: event `"user"` (owner only)

The gateway joins each socket to `user:<userId>` from the **verified token**; clients
cannot choose or change it. Messages: `{ type, data, timestamp }`.

| type | source | data |
|------|--------|------|
| `order.accepted` | order-service `order.created` | `orderId, symbol, side, orderType, quantity, price, timeInForce, postOnly, status, createdAt` |
| `order.rejected` / `order.cancelled` | engine | `orderId, symbol, reason` |
| `order.completed` | engine | `orderId, symbol, status` (`FILLED` / `PARTIALLY_FILLED`) |
| `trade.executed` | engine | `tradeId, symbol, orderId, side, liquidity (MAKER/TAKER), price, quantity, orderStatus, executedAt` — own side only |
| `deposit.completed` | existing deposit flow (separate socket event) | unchanged |

Never sent: counterparty IDs, reservation IDs, fees, wallet internals.
