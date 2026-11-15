# Aurax architecture docs

This folder explains how Aurax works from the inside: what each service does,
how the services talk to each other, how the matching engine works, and what
happens step by step in every important flow.

Everything here was checked against the code on 2026-11-16. When the code and a
document disagree, the code wins. File paths are given so you can check.

## Reading order

If you are new to the project, read these in order:

| # | Document | What you learn |
|---|---|---|
| 1 | [System overview](01-system-overview.md) | The big picture: components, design rules, tech stack, ports |
| 2 | [Services](02-services.md) | Each service in depth: job, internal modules, startup order, config |
| 3 | [Communication](03-communication.md) | HTTP, gRPC, Kafka and socket.io: who talks to whom, and why |
| 4 | [Matching engine](04-matching-engine.md) | Order book, matching algorithm, sharding, snapshots, crash recovery |
| 5 | [End-to-end flows](05-flows.md) | Sign in, deposit, place order, settle, cancel, market data, restarts |
| 6 | [Data model](06-data-model.md) | Tables, state machines, money math, sources of truth |
| 7 | [Reliability](07-reliability.md) | Idempotency, outbox, failure modes, reconciliation, known limits |
| 8 | [Frontend](08-frontend.md) | How the Next.js app uses the REST API and the socket |
| 9 | [Operations](09-operations.md) | Running locally, env vars, testing, scaling notes |

## One-paragraph summary

Aurax is a crypto spot exchange built as Bun + TypeScript microservices in a
Turborepo monorepo. The browser talks to two public services only:
`api-gateway` (REST) and `websockets` (socket.io). Behind them, `auth-service`
handles OAuth and JWT sessions, `wallet-service` owns balances and Razorpay
deposits, `order-service` accepts orders and settles trades, the `engine`
matches orders in memory, and `market-service` builds public market data.
Services ask each other for things over **HTTP** or **gRPC** when they need an
answer right away, and send **commands and events over Kafka** for everything
else. Money only moves inside Postgres transactions. Every Kafka event has a
deterministic id, so every consumer can safely see the same event twice.

## Other docs in this repo

- [`../EVENT_FLOWS.md`](../EVENT_FLOWS.md): compact Kafka event inventory
- [`../frontend-integration/`](../frontend-integration/): HTTP API, WebSocket API, OpenAPI spec
- [`../../apps/market-service/MARKET_DATA_PROTOCOL.md`](../../apps/market-service/MARKET_DATA_PROTOCOL.md): v2 market-data wire protocol
- [`../../apps/trading-bots/README.md`](../../apps/trading-bots/README.md): the dev-only bot lab
