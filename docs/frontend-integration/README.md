# Aurax frontend integration guide

This is the backend contract the web app is built against. Everything here was
checked against the code on **2026-10-26**:
- each documented path was cross-checked against the registered Express routes;
- `openapi.yaml` passes `redocly lint`.

Where code and docs disagree, the code wins: fix the doc.

| Document | Read it for |
|---|---|
| [architecture.md](architecture.md) | services, ports, data ownership, order / deposit / market-data flows (Mermaid) |
| [http-api.md](http-api.md) | every REST endpoint with request/response examples, errors, paging, rate limits |
| [authentication.md](authentication.md) | OAuth sign-in, cookies, refresh rotation, logout, socket auth |
| [websocket-api.md](websocket-api.md) | socket.io events: public market channels, depth resync algorithm, private user events |
| [kafka-events.md](kafka-events.md) | internal topics and payloads behind each socket message |
| [frontend-integration-matrix.md](frontend-integration-matrix.md) | each planned UI feature → endpoint/event → readiness status and evidence |
| [missing-backend-capabilities.md](missing-backend-capabilities.md) | what was added in this pass, and what is still missing (with proposals) |
| [frontend-environment.md](frontend-environment.md) | env vars, local stack, origins/cookies, third parties, security checklist |
| [openapi.yaml](openapi.yaml) | machine-readable REST contract (OpenAPI 3.1); proposals only under `x-proposed` |

## The ten rules

1. Call only **api-gateway** (`NEXT_PUBLIC_API_URL`) and **websockets**
   (`NEXT_PUBLIC_SOCKET_URL`), both with credentials.
2. Auth lives in HttpOnly cookies. Never touch tokens. On a 401, refresh
   once (single-flight), then go to `/login`.
3. Every amount is a **decimal string**. Never do float math on values you
   submit.
4. Orders are **asynchronous**. `202` means "reserved and queued"; the state
   comes from `user` socket events or `GET /order/:id`.
5. Deduplicate everything:
   - private events by `eventId`;
   - balances by the highest `version`;
   - trades by `tradeId`;
   - depth by `sequenceNumber`.
6. Depth needs the snapshot → delta → gap → resync algorithm
   ([websocket-api.md](websocket-api.md#depth-book-algorithm-required)).
7. After any socket (re)connect, resubscribe the market channels and refetch
   the private state over HTTP.
8. Show missing features as unavailable. Never fake them:
   - withdrawals;
   - MARKET BUY;
   - email login;
   - 2FA;
   - API keys.
9. Only the Razorpay webhook credits deposits. After checkout, show
   "confirming", then wait for `deposit.completed` or poll
   `GET /wallet/deposits/:id`.
10. No demo or simulated data ships in the app; fixtures exist only in `apps/web/test`.

## Verifying this documentation

```bash
# OpenAPI validity
bunx @redocly/cli@1.34.0 lint docs/frontend-integration/openapi.yaml
# Backend tests behind the "Verified" labels
(cd apps/auth-service && bun test)
(cd apps/wallet-service && bun test)
(cd apps/order-service && bun test)          # DB tests: RUN_DB_TESTS=1 PG_DATABASE_URL=<isolated db>
(cd apps/market-service && bun test)
(cd apps/websockets && bun test)
(cd apps/engine && bun test)
```

The DB-backed tests must run against an **isolated** Postgres, never a
shared one. See the header of `apps/order-service/test/settlement.db.test.ts`.

## Older documents

The files directly under `docs/` (`api/*`, `architecture.md`,
`authentication.md`, `getting-started.md`, `environments.md`) describe an
earlier design: REST on :3000 and WS on :4000, with no orders. Each now
carries a "superseded" notice pointing here. `docs/INTEGRATION_AUDIT.md` and
`docs/EVENT_FLOWS.md` remain current.
