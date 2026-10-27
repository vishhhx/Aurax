# Aurax Event Flows (Kafka inventory)

Delivery everywhere is **at-least-once**; every event carries a deterministic
`eventId` and every consumer with side effects is idempotent. Nothing here is
exactly-once by itself.

## Topics

| Topic | Carries | Key | Ordering guaranteed for |
|---|---|---|---|
| `order.events` | order **commands**: `order.created`, `order.cancel_requested` | symbol | all commands of one market (deterministic engine replay) |
| `trade.executed` | engine **execution reports**: `trade.executed`, `order.opened`, `order.cancelled`, `order.rejected`, `order.cancel_rejected` | symbol | fills and lifecycle of one market (a cancel never overtakes its fills) |
| `market.events` | engine `orderbook.updated` (full book) + market-service v2 `depth/trades/ticker/candles.updated` | symbol | one market |
| `deposit.events` | `deposit.completed` | userId | one user |
| `notification.events` | `balance.updated` | userId | one user |

## Inventory

| Event | Producer (mechanism) | Consumers (group) | Side effects / idempotency | Visibility |
|---|---|---|---|---|
| `order.created` | order-service (outbox, same tx as Order row) | engine shard (`engine.<markets>`), websockets (`websockets.user-orders.<instance>`) | engine: adds to book; duplicate IDs ignored via recent-command set (persisted in snapshots) | private (owner) |
| `order.cancel_requested` | order-service (outbox) | engine shard | engine removes remainder; duplicate ignored | internal |
| `order.opened` | engine (deterministic id `opened:<orderId>`) | order-service (`order-service.execution-reports`), websockets (`…user-executions.<instance>`) | PENDING → OPEN (conditional update) | private |
| `trade.executed` | engine (`<takerOrderId>-f<n>`) | order-service, market-service (`market-service.trades`), websockets | settlement once per `executionId` (+Trade PK); MarketTrade insert-if-absent | private (per side) / public via market data |
| `order.cancelled` / `order.rejected` | engine | order-service, websockets | close + release remaining reservation; terminal orders no-op; executed-qty mismatch → retry | private |
| `order.cancel_rejected` | engine | websockets | none | private |
| `orderbook.updated` | engine | market-service (`market-service.orderbook`) | book replace; stale/regressed handling | internal |
| `depth/trades/ticker/candles.updated` | market-service | websockets (`websockets.market-data.<instance>`) | none (fan-out; dedupe by eventId / sequence) | **public** |
| `balance.updated` | wallet-service & order-service (outbox, same tx as the wallet change) | websockets (`…user-balances.<instance>`) | none; clients keep highest `version` | private |
| `deposit.completed` | wallet-service (outbox, same tx as the credit) | websockets (`…user-deposits.<instance>`) | none (credit happened in the tx) | private |

## Consumer-group rules

- **Different services** that each need every event use **different groups**
  (engine, order-service, market-service and the gateways previously collided on
  `order.events`, which split the topic between them).
- **Engine shards** each own a distinct group (`engine.BTCUSDC-ETHUSDC`, …).
- **Replicas of one worker service** (order-service, market-service) share their
  group: each report is processed by one replica.
- **Gateway instances** are independent broadcasters: each uses a per-instance
  group (`…<INSTANCE_ID>`) deleted on graceful shutdown, so every instance sees
  every event for its local sockets.

## Dual-write handling

Every DB change that emits an event writes an `OutboxEvent` row in the same
transaction. `OutboxRelay` (run by order-service and wallet-service; one active
relay at a time via a Postgres advisory lock) publishes rows in insertion order
and marks them published. A crash between publish and mark → re-publish →
consumers deduplicate.

The engine is in-memory and has no outbox: after a restart it replays commands
silently up to the group's committed offset and LIVE afterwards; deterministic
event IDs make any re-published report a no-op downstream.
