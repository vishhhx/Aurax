# WebSocket API

Verified against `apps/websockets/src/{gateway.ts, market/protocol.ts,
market/hub.ts, market/market-data.ts, private/user-events.ts, server.ts}`
(2026-10-26). This doc supersedes §2 of
`apps/market-service/MARKET_DATA_PROTOCOL.md`, which predates anonymous
access and the private lifecycle and balance events.

## Connection

| Item | Value |
|---|---|
| Server | socket.io v4, `NEXT_PUBLIC_SOCKET_URL` (default `http://localhost:5005`) |
| CORS | `CORS_ORIGINS` with `credentials: true` |
| Heartbeat | ping every 25 s, timeout 20 s |
| Auth | optional; see below |

```ts
import { io } from "socket.io-client";
const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"] });
```

## Access policy and the `session` event

The gateway reads the access token from (first match wins):
1. handshake `auth.token`;
2. the `Authorization: Bearer` header;
3. the `accessToken` cookie. Browsers use this one, via `withCredentials`.

Tokens are never logged.

Right after connecting, the server emits:

```ts
socket.on("session", (s: { authenticated: boolean; userId?: string; reason?: "invalid_token" | "expired_token" }) => {});
```

| Case | Result |
|---|---|
| No token | `{authenticated: false}`; public channels only |
| Valid token | `{authenticated: true, userId}`; the socket is joined to `user:<userId>` |
| Invalid or expired token | `{authenticated: false, reason}`; public only. Refresh over HTTP, then **reconnect** (`socket.disconnect().connect()`) |

The server chooses the private room from the **verified** token. A client
cannot subscribe to another user's events, because no private subscription
message exists.

## Public market data: event `"market"`

### Requests (client → server)

```ts
socket.emit("market", { action: "subscribe", channel: "depth", symbol: "BTCUSDC" }, (ack) => {});
socket.emit("market", { action: "subscribe", channel: "candles", symbol: "BTC-USDC", interval: "1m" }, ack);
socket.emit("market", { action: "subscribe", subscriptions: [
  { channel: "ticker", symbol: "BTCUSDC" }, { channel: "trades", symbol: "BTCUSDC" } ] }, ack);
socket.emit("market", { action: "unsubscribe", channel: "depth", symbol: "BTCUSDC" }, ack);
socket.emit("market", { action: "resync", channel: "depth", symbol: "BTCUSDC" }, ack);   // after a gap
```

- **Channels:** `depth`, `trades`, `ticker`, `candles`. Candles require an
  `interval` of `1m | 5m | 15m | 1h | 1d`.
- **Acks:** a success looks like `{ ok: true, action, keys: ["md:depth:BTCUSDC"] }`,
  a failure like `{ ok: false, error }`. Without an ack callback, errors
  arrive as `{ type: "error", error }` on `"market"`.
- **Limits:** at most 25 items per request and 50 subscriptions per socket
  (`MAX_SUBSCRIPTIONS_PER_SOCKET`). Unknown markets are rejected once the
  gateway has loaded the market list.
- **Idempotent subscribe:** subscribing twice sends no second snapshot and
  causes no duplicate delivery.
- **Reconnects:** subscriptions are **not** restored automatically. On every
  `connect` (including reconnects), resubscribe everything.

### Messages (server → client)

```ts
type MarketMessage =
  | { type: "snapshot"; key; channel; symbol; interval?; sequenceNumber: string | null; data }
  | { type: "update"; key; channel; symbol; interval?; eventId; sequenceNumber: string | null; prevSequenceNumber?: string; timestamp: number; data }
  | { type: "resync"; key; channel: "depth"; symbol; reason: "awaiting_snapshot" | "sequence_gap" }
  | { type: "error"; error: string };
```

| Channel | `snapshot.data` | `update.data` | Delivery |
|---|---|---|---|
| `depth` | `{ sequenceNumber, depth, bids, asks }` (top-N, N = `depth`, default 50) | `{ bids, asks }`: **changed levels only**; `quantity: "0"` removes a level | reliable, ordered |
| `trades` | `TradeData[]`, newest first, ≤ 50 | `TradeData` | reliable |
| `ticker` | `TickerData \| null` | `TickerData` | **latest only**, coalesced every 250 ms, volatile (may drop) |
| `candles` | `CandleData \| null` (the current candle) | `CandleData` | reliable |

```ts
type Level = { price: string; quantity: string };      // bids desc, asks asc
type TradeData = { tradeId; price; quantity; quoteQuantity; side: "BUY" | "SELL" /* taker */; isBuyerMaker: boolean; executedAt: number };
type TickerData = { lastPrice: string | null; openPrice24h; priceChange24h; priceChangePercent24h /* percent */; high24h; low24h;
                    baseVolume24h: string; quoteVolume24h: string; tradeCount24h: number; lastTradeTimestamp: number | null; windowStart: number };
type CandleData = { interval; openTime; closeTime; open; high; low; close; baseVolume; quoteVolume; tradeCount: number; isClosed: boolean };
```

> **Field names differ from REST.** WS tickers use `openPrice24h`,
> `high24h`, `baseVolume24h`, and so on; REST tickers use `openPrice`,
> `highPrice`, `volume`. WS trades use `executedAt`, REST trades use
> `timestamp`. Normalise both in one adapter, as `apps/web/lib/market-client.ts`
> does.

### Depth book algorithm (required)

```
on snapshot:  book = data; seq = BigInt(sequenceNumber); show book
on update:    if BigInt(sequenceNumber) <= seq → ignore (duplicate)
              elif prevSequenceNumber === String(seq) → apply changed levels; seq = sequenceNumber
              else → gap: hide/grey the book, emit {action:"resync"} (or resubscribe)
on resync:    hide/grey the book; a snapshot follows
```

The gateway sends a subscriber's snapshot **before** joining it to the room, in
the same synchronous step, so no update can fall between them. Sequence
numbers are per symbol, can **restart lower** after an engine restart (always
preceded by a snapshot), and are strings: compare them as `BigInt`.

Other deduplication rules:
- trades: deduplicate by `tradeId`;
- candles: replace by `openTime`;
- tickers: keep the newest message.

### Slow clients

A socket whose outbound buffer exceeds `SLOW_CLIENT_BUFFER_LIMIT` (1000)
messages is disconnected. Reconnect and resubscribe; snapshots restore state.

## Private events: event `"user"` (authenticated sockets only)

```ts
socket.on("user", (m: { type: UserMessageType; eventId: string; data: object; timestamp: number }) => {});
```

| `type` | When | `data` |
|---|---|---|
| `order.accepted` | order persisted (order-service `order.created`) | `orderId, symbol, side, orderType, quantity, price \| null, timeInForce, postOnly, status: "PENDING", createdAt` |
| `order.opened` | resting on the book | `orderId, symbol, side, price, executedQuantity, remainingQuantity` |
| `trade.executed` | each fill of **your** side | `tradeId, symbol, orderId, side, liquidity: "MAKER" \| "TAKER", price, quantity, orderStatus, executedAt` |
| `order.partially_filled` / `order.filled` | after each fill | `orderId, symbol, side, lastFillPrice, lastFillQuantity, executedQuantity, remainingQuantity, status` |
| `order.cancelled` | remainder cancelled | `orderId, symbol, reason, executedQuantity?, remainingQuantity?` |
| `order.rejected` | the engine refused the order | `orderId, symbol, reason` |
| `order.cancel_rejected` | the cancel could not apply | `orderId, symbol, reason: "NOT_OPEN" \| "NOT_OWNER"` |
| `balance.updated` | any committed balance change | `assetId, asset, available, locked, total, reason, referenceId, version` |
| `deposit.completed` | deposit credited | `depositId, assetId, amount, balance \| null` |

Reason values:

| Field | Values |
|---|---|
| `order.cancelled.reason` | `USER_CANCELLED`, `IOC_REMAINING_QUANTITY`, `MARKET_NO_LIQUIDITY` |
| `order.rejected.reason` | `INVALID_QUANTITY`, `POST_ONLY_MARKET_ORDER`, `POST_ONLY_WOULD_TAKE_LIQUIDITY`, `FOK_NOT_FULLY_FILLABLE` |
| `balance.updated.reason` | `DEPOSIT`, `ORDER_RESERVED`, `ORDER_RELEASED`, `TRADE` (`WITHDRAWAL` and `ADJUSTMENT` are declared but never emitted) |

Fees, counterparty ids, reservation ids and wallet internals are never sent.

For compatibility, `deposit.completed` is also emitted as its own socket event,
`"deposit.completed"`, with the same `data`. New code should use `"user"`.

### Client rules

- **At-least-once delivery.** Deduplicate by `eventId`; keep a bounded LRU.
- **Balances:** for each `assetId`, keep the message with the highest
  `version` and ignore older ones. `version` is the wallet row's update time
  in ms.
- **Ordering:** events of one market are ordered among themselves. Balances
  come from another topic and may arrive before or after the matching order
  event. Treat order events and balances independently.
- **Gaps:** nothing is replayed while a socket is disconnected. On every
  (re)connect with `authenticated: true`, refetch over HTTP:
  - `GET /api/v1/wallet/assets`;
  - `GET /api/v1/order?status=open`;
  - and whatever history view is open.
- `order.accepted` can arrive **before** the `202` HTTP response. Merge by
  `orderId`.

## Ops

`GET /health` and `GET /metrics` (Prometheus) on the socket port.
