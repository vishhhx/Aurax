# Architecture

Verified against the code on 2026-10-26. Ports are the defaults from each
service's `config/env.ts`.

## Components

```mermaid
flowchart LR
  Browser["Browser<br/>apps/web (Next.js 16, :3000)"]

  subgraph Public edge
    GW["api-gateway :5000<br/>CORS · rate limit · proxy"]
    WS["websockets :5005<br/>socket.io"]
  end

  subgraph Internal HTTP
    AUTH["auth-service :5001"]
    WAL["wallet-service :5002"]
    ORD["order-service :5003"]
    MKT["market-service :5004"]
  end

  subgraph Internal gRPC
    WALG["wallet gRPC :8002<br/>ReserveBalance · ReleaseBalance"]
    ENG["engine shards<br/>gRPC :8003 / :8004"]
  end

  subgraph Data
    PG[("Postgres<br/>wallets · ledger · orders · trades · markets · outbox")]
    MONGO[("MongoDB<br/>users")]
    REDIS[("Redis<br/>refresh sessions · OAuth state · user cache")]
    K{{"Kafka"}}
  end

  RZP["Razorpay"]

  Browser -- "HTTPS /api/v1/*" --> GW
  Browser -- "socket.io" --> WS
  Browser -- "Checkout.js" --> RZP
  RZP -- "webhook /api/v1/wallet/webhook/razorpay" --> GW

  GW --> AUTH & WAL & ORD & MKT
  AUTH --- MONGO & REDIS
  WAL --- PG
  ORD --- PG
  MKT --- PG
  ORD -- gRPC --> WALG
  MKT -- "gRPC GetOrderBook / GetEngineStatus" --> ENG
  WS -- "HTTP: published depth, market list" --> MKT

  ORD -- "order.events (outbox)" --> K
  K -- "order.events" --> ENG
  ENG -- "trade.executed · market.events" --> K
  K -- "trade.executed" --> ORD & MKT
  MKT -- "market.events v2" --> K
  WAL -- "deposit.events · notification.events (outbox)" --> K
  ORD -- "notification.events (outbox)" --> K
  K -- "all public + private events" --> WS
```

The browser only talks to **api-gateway** (HTTP) and **websockets**
(socket.io). Every other service, both gRPC servers and all data stores are
internal. The frontend must never call `:5001–:5004`, `:8002–:8004` or Kafka
directly.

| Service | Owns | Does not do |
|---|---|---|
| api-gateway | CORS, per-IP rate limits, routing `/api/v1/{auth,wallet,order,market}` | Auth checks (each service verifies the JWT itself) |
| auth-service | Google/GitHub OAuth, JWT issue/refresh/logout, user profile | Email/password login (code exists, not routed), 2FA, API keys |
| wallet-service | Balances, reservations (gRPC), Razorpay INR→USDC deposits, deposit and ledger history | Withdrawals, crypto deposits, transfers |
| order-service | Order intake, cancel, order/fill history, **trade settlement** | Matching |
| engine | In-memory books, price-time matching, sharded by market | Persistence of orders (Postgres is owned by order-service) |
| market-service | Markets, tickers, depth, public trades, candles; v2 market-data events | Private data |
| websockets | Fan-out of public market data and the caller's own private events | Accepting orders or any write |

## Order lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant G as api-gateway
  participant O as order-service
  participant W as wallet gRPC
  participant K as Kafka
  participant E as engine
  participant S as websockets

  B->>G: POST /api/v1/order {symbol, side, orderType, price, quantity}
  G->>O: POST /
  O->>W: ReserveBalance(user, asset, amount, referenceId)
  W-->>O: ok (available → locked, atomic)
  O->>O: tx: Order(PENDING) + OutboxEvent(order.created)
  O-->>B: 202 {order, reserved}
  O->>K: order.events: order.created (outbox relay)
  K->>S: order.created → "user" order.accepted
  K->>E: order.created
  E->>K: trade.executed topic: order.opened / trade.executed / order.cancelled / order.rejected
  K->>O: settle once per executionId (wallets, ledger, trades, outbox balance.updated)
  K->>S: → "user" order.opened / trade.executed / order.partially_filled / order.filled / ...
  O->>K: notification.events: balance.updated
  K->>S: → "user" balance.updated
```

`202 Accepted` means only "funds reserved and command queued". Final state
comes from the private socket or `GET /api/v1/order/:orderId`.

## Deposit (Razorpay)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant G as api-gateway
  participant W as wallet-service
  participant R as Razorpay
  participant K as Kafka
  participant S as websockets

  B->>G: POST /api/v1/wallet/payment/razorpay/init-deposit {amount: "500"}
  G->>W: create Deposit(PENDING, USDC = INR / USDC_INR_RATE, rounded down)
  W->>R: orders.create(amount paise, INR, receipt = depositId)
  W-->>B: Razorpay order {id, amount, currency, receipt, ...}
  B->>R: Checkout.js with order id + public key
  R-->>B: razorpay_order_id, razorpay_payment_id, razorpay_signature
  B->>G: POST /api/v1/wallet/payment/razorpay/verify
  W-->>B: {depositId, status: CONFIRMING}  (no credit yet)
  R->>G: webhook payment.captured (signed)
  G->>W: POST /webhook/razorpay (raw body, HMAC verified)
  W->>W: tx: Deposit COMPLETED + wallet credit + Ledger + outbox
  W->>K: deposit.events: deposit.completed · notification.events: balance.updated
  K->>S: → "user" deposit.completed, balance.updated
```

Only the signed webhook credits funds. The client-side `verify` call can never
credit or downgrade a deposit.

## Public market data

```mermaid
flowchart LR
  E[engine] -- "trade.executed" --> M[market-service]
  E -- "orderbook.updated (full book)" --> M
  M -- "gRPC GetOrderBook on start / resync" --> E
  M -- "depth.updated · trades.updated · ticker.updated · candles.updated" --> K{{market.events}}
  K --> WS[websockets hub]
  WS -- "snapshot, then update/resync" --> C[browser]
  C -. "REST: candles, history, orderbook" .-> G[api-gateway] -.-> M
```

## Sources of truth

| Data | Authoritative store | Live projection |
|---|---|---|
| Balances | Postgres `Wallet` (+ `Ledger` for every movement) | `balance.updated` (keep highest `version`) |
| Orders and fills | Postgres `Order`, `Trade` (order-service) | private socket order/trade events |
| Order book | engine memory (snapshots on fs/S3) | market-service mirror → `depth` channel |
| Public trades, candles, tickers | Postgres `MarketTrade`, `Candle` + market-service memory | public socket channels |
| Users | MongoDB | — |
| Sessions | Redis `session:<refreshToken>` | — |

## Delivery guarantees

- Kafka delivery is at-least-once everywhere. Every event has a deterministic
  `eventId`, and every consumer with side effects is idempotent.
- DB changes that emit events use a transactional outbox (`OutboxEvent` +
  `OutboxRelay` in `@repo/pg`).
- WebSocket clients must deduplicate by `eventId` (private), `sequenceNumber`
  (depth), `tradeId` (trades) and `version` (balances). See
  [websocket-api.md](websocket-api.md).
