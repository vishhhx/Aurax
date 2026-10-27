# Kafka events

Kafka is **internal**: the frontend never connects to it. This page exists so
frontend engineers can see where each WebSocket message comes from, and what
it guarantees. Verified against the producers on 2026-10-26.

For consumer-group rules and dual-write handling, see
[`docs/EVENT_FLOWS.md`](../EVENT_FLOWS.md).

## Topics

| Topic | Key | Producer | Consumers (group) | Reaches the browser as |
|---|---|---|---|---|
| `order.events` | symbol | order-service (outbox) | engine shard (`engine.<markets>`), websockets (`websockets.user-orders.<instance>`) | `user` → `order.accepted` |
| `trade.executed` | symbol | engine | order-service (`order-service.execution-reports`), market-service (`market-service.trades`), websockets (`…user-executions.<instance>`) | `user` → order lifecycle + own fills |
| `market.events` | symbol | engine (`orderbook.updated`), market-service (v2 events) | market-service (`market-service.orderbook`), websockets (`websockets.market-data.<instance>`) | `market` channels |
| `deposit.events` | userId | wallet-service (outbox) | websockets (`…user-deposits.<instance>`) | `user` → `deposit.completed` |
| `notification.events` | userId | wallet-service, order-service (outbox) | websockets (`…user-balances.<instance>`) | `user` → `balance.updated` |

Delivery is **at-least-once**, and every event id is deterministic. Events
are ordered only within a key: per market for the first three topics, per
user for the last two.

## Payloads

### `order.events`

```jsonc
{ "eventId": "order.created:<orderId>", "event": "order.created", "orderId", "userId", "symbol",
  "side": "BUY|SELL", "orderType": "LIMIT|MARKET", "timeInForce": "GTC|IOC|FOK",
  "price": "65000" /* null for MARKET */, "quantity": "0.001", "postOnly": false,
  "status": "PENDING", "createdAt": "<ISO>" }

{ "eventId": "order.cancel_requested:<orderId>", "event": "order.cancel_requested",
  "orderId", "userId", "symbol", "requestedAt": "<ISO>" }
```

### `trade.executed` (engine execution reports)

Every report carries `eventId`, `symbol` and `timestamp` (ms). Prices and
quantities are formatted to market precision.

| `event` | `eventId` | Extra fields |
|---|---|---|
| `order.opened` | `opened:<orderId>` | `orderId, userId, side, price, executedQuantity, remainingQuantity` |
| `trade.executed` | `trade:<tradeId>` | `tradeId` (`<takerOrderId>-f<n>`), `marketId, price, quantity, maker{…}, taker{…}`; each party is `{orderId, userId, side, status, executedQuantity, remainingQuantity}` |
| `order.cancelled` | `cancelled:<orderId>` | `orderId, userId, reason (USER_CANCELLED \| IOC_REMAINING_QUANTITY \| MARKET_NO_LIQUIDITY), executedQuantity, remainingQuantity` |
| `order.rejected` | `rejected:<orderId>` | `orderId, userId, reason` |
| `order.cancel_rejected` | `cancel-rejected:<orderId>` | `orderId, userId, reason (NOT_OPEN \| NOT_OWNER)` |

### `market.events`

- **Engine `orderbook.updated`:** `{ event, symbol, sequenceNumber, bids, asks, timestamp }`.
  This is the full book, consumed only by market-service.
- **market-service v2 events:** `{ eventId, type, schemaVersion: 2, symbol, sequenceNumber, timestamp, data }`.
  - Headers: `event-type`, `event-id`, `schema-version`.
  - `type` is one of `depth.updated | trades.updated | ticker.updated | candles.updated`.
  - The `data` shapes are the WS `update.data` shapes in
    [websocket-api.md](websocket-api.md). The depth event additionally carries
    `kind` (`snapshot | delta`), `depth` and `prevSequenceNumber`.

### `deposit.events`

```jsonc
{ "eventId": "deposit.completed:<depositId>", "event": "deposit.completed", "userId", "depositId",
  "assetId", "amount": "5.95238095", "balance": "<available after credit>", "timestamp": "<ISO>" }
```

### `notification.events`

```jsonc
{ "eventId": "balance:<reason>:<referenceId>:<userId>:<assetId>", "event": "balance.updated",
  "userId", "assetId", "asset": "USDC", "available", "locked", "total",
  "reason": "DEPOSIT|ORDER_RESERVED|ORDER_RELEASED|TRADE", "referenceId",
  "version": 1793000000000 /* wallet.updatedAt ms */, "timestamp": 1793000000000 }
```

`balance.updated` is a projection of the wallet row **after** a committed
change. It is written in the same transaction as the change, so it is never
sent for a rolled-back change. The `Ledger` table stays authoritative.

## Not present

No topic or event exists for:
- withdrawals;
- order expiry (`EXPIRED`);
- deposit failure;
- user/profile changes;
- notifications other than balances.

See [missing-backend-capabilities.md](missing-backend-capabilities.md).
