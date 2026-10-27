# Aurax Backend Integration Audit (2026-10-26)

Status legend: **FV** fixed & verified · **FN** fixed, not fully verified · **BR** still broken ·
**EXT** blocked by external dependency · **DEF** intentionally deferred.
The "Status" column is updated at the end of the work (see §6).

## 1. Architecture as found

| Responsibility | Owner | Notes |
|---|---|---|
| HTTP edge, CORS, routing | `apps/api-gateway` (:5000) | Proxies `/api/v1/{auth,wallet,order,market}`; no rate limiting |
| Identity, OAuth, JWT cookies | `apps/auth-service` (:5001) | Google/GitHub OAuth only; users in MongoDB |
| Balances, reservations, deposits | `apps/wallet-service` (:5002, gRPC :8002) | Razorpay INR→USDC deposits; **no withdrawals** |
| Order intake + **trade settlement** | `apps/order-service` (:5003) | Writes Order/Trade and wallet/ledger rows on fills |
| Matching, in-memory books | `apps/engine` (gRPC :8003) | Node cluster: 2 workers sharded by market; S3 snapshots |
| Public market data | `apps/market-service` | Tickers, candles, depth, trades |
| Socket fan-out | `apps/websockets` | socket.io; public market + private user events |
| Frontend | `apps/web` (:3000) | Next.js 16 |
| Shared | `packages/{kafka,pg,grpc,core,redis,logger,mongodb}` | Single Postgres DB shared by services |

## 2. Findings

### Configuration / topology
| # | Finding | Status |
|---|---|---|
| C1 | `.gitignore` bare `test` ignores every nested `test/` dir (all new tests uncommitted) | |
| C2 | Engine cluster workers share group `order.events` → with 1 partition only one worker gets commands; the other worker's markets never trade | |
| C3 | Engine and Order Service share group `order.events` → commands/events split between them | |
| C4 | Order Service reads `trade.executed` from `order.events`; engine publishes it on `trade.executed` | |
| C5 | Order Service never starts its Kafka consumer (`server.ts`) | |
| C6 | Engine lifecycle events (`order.*`) and trades are on different topics → cancel can be processed before the fills that preceded it | |
| C7 | `order.created` keyed by userId → one market's commands spread over partitions → non-deterministic engine replay | |
| C8 | `@repo/grpc` server always binds `WALLET_GRPC_URL` (engine included) | |
| C9 | Ports: market-service and order-service both 5003; WS gateway 5004; no `MARKET_SERVICE_URL` in api-gateway | |
| C10 | Deposit consumer in WS gateway uses shared group `deposit.events` → multi-instance deliveries lost; Redis socket registry only works for local sockets | |
| C11 | Kafka/Redis hosts hard-coded | fixed earlier (env) |

### Order lifecycle / engine
| # | Finding | Status |
|---|---|---|
| E1 | Engine crashes on every `order.created`: `createdAt` arrives as a string (`.getTime()`) | |
| E2 | Quantities are JS floats → residues like 5.55e-17 (dust orders, invalid decimals downstream) | |
| E3 | Trade IDs are random UUIDs → recovery replays cannot be deduplicated | |
| E4 | "Rebuild from beginning" never seeks to offset 0 (committed offset wins) → empty book after restart without snapshot | |
| E5 | Commands processed after the last commit are replayed silently (RECOVERY) → their trades are never published | |
| E6 | No duplicate-command protection (an at-least-once `order.created` would add the order twice) | |
| E7 | No cancel command; no `order.opened` event; `order.completed` declared but never emitted | |
| E8 | Snapshots only to S3 (no local/test store) | |

### Order Service / settlement
| # | Finding | Status |
|---|---|---|
| O1 | Reservation failure (`success:false`) ignored → orders created without funds (dev DB: 9 orders, 1 reservation) | |
| O2 | Schema: `price` required for MARKET, then rejected → MARKET orders impossible | |
| O3 | Float arithmetic for reservation/notional; no tick/step validation | |
| O4 | MARKET BUY reserved at a hard-coded price of 100; the engine cannot bound a market buy's cost | |
| O5 | BUY reservation excludes fees, settlement consumes quote+fee → "Insufficient reservation" on full fills | |
| O6 | Leftover reservation (price improvement / fee buffer) never released when an order fills | |
| O7 | Replayed `trade.executed` → PK violation → infinite retry (poison message) | |
| O8 | Replayed cancel/reject → "Order cannot be closed" → poison message | |
| O9 | Settlement `wallet.update` fails when the receiving wallet row doesn't exist | |
| O10 | Order created/published not atomic (publish failure strands a PENDING order + reservation) | |
| O11 | No cancel endpoint, no order/trade history endpoints | |
| O12 | Status trusted from engine float math instead of persisted remaining quantity | |

### Wallet
| # | Finding | Status |
|---|---|---|
| W1 | Reservation is read-check-update → concurrent orders double-spend | |
| W2 | `deposit.completed` published inside the DB transaction (before commit) | |
| W3 | `/verify` can downgrade a COMPLETED deposit to CONFIRMING | |
| W4 | Deposit amounts as floats (paise, USDC conversion) | |
| W5 | Webhook: non timing-safe compare; logs payload (PII) and expected signature | |
| W6 | Duplicate webhook route behind auth (cannot work: body is parsed JSON) | |
| W7 | No balance-changed event | |
| W8 | No withdrawals | |
| W9 | No ReleaseBalance gRPC (declared in proto) | |

### Gateway / frontend / security
| # | Finding | Status |
|---|---|---|
| G1 | All socket data requires login (no anonymous public market data) | |
| G2 | Partial fills only visible as trade status; lifecycle not explicit | |
| F1 | Landing page uses simulated prices | |
| S1 | API gateway: no rate limiting; CORS origin hard-coded | |
| S2 | Wallet/Order services reachable directly (no internal auth); rely on JWT | |

## 3. Kafka event inventory (target)

See §5 of the final report; maintained in `docs/EVENT_FLOWS.md`.

## 6. Final status (2026-10-26)

FV = fixed & verified (unit/integration and/or isolated E2E) · FN = fixed, not fully verified · DEF = deferred · EXT = external dependency

| # | Status | Evidence |
|---|---|---|
| C1 .gitignore | FV | `git check-ignore`: root `/test` ignored, nested `test/` tracked |
| C2–C7 topology, groups, keys, consumer start | FV | E2E 34/34 ×3 runs; engine shards each get every command |
| C8 gRPC bind | FV | wallet 8002, engine 8003/8004 in E2E |
| C9 ports | FV | 5000 api · 5001 auth · 5002 wallet · 5003 order · 5004 market · 5005 ws; all bound simultaneously in E2E |
| C10 deposit fan-out | FV | E2E: deposit/balance events reach the right user on gw1 and gw2 |
| E1–E7 engine | FV | engine tests (11) + E2E restart/rebuild-from-scratch |
| E8 local snapshots | FV | fs store used in E2E; S3 path unchanged, **not exercised** (EXT) |
| O1–O12 order/settlement | FV | settlement.db tests (9, real Postgres) + E2E scenarios A–D |
| O4 MARKET BUY | DEF | rejected with 400 until the engine supports a quote budget |
| W1–W7, W9 wallet | FV | concurrency test (3 of 10 reservations), webhook replay, outbox events |
| W8 withdrawals | DEF | not implemented anywhere; needs custody/business design |
| G1 public market data | FV | anonymous sockets: public channels yes, private none |
| G2 lifecycle | FV | opened → partially_filled ×2 → filled; cancelled keeps executed qty |
| F1 frontend real data | FN | typecheck/lint/build pass; wired to real APIs; **not exercised in a browser** |
| S1 rate limit / CORS | FN | implemented; not load-tested |
| S2 internal auth | DEF | services still trust network placement + user JWT |

## 7. Second pass: documentation and contract audit (2026-10-26)

Found while documenting the contract in `docs/frontend-integration/`. The
details are in `docs/frontend-integration/missing-backend-capabilities.md`.

| # | Finding | Status | Evidence |
|---|---|---|---|
| A1 | No logout endpoint (frontend called a 404) | FV | `auth-service/test/sessions.test.ts` |
| A2 | JWTs issued in the same second were identical, so refresh rotation returned the same token and sessions collided | FV | rotation/reuse tests (unique `jti`) |
| A3 | Google OAuth had no `state`; GitHub `state` was not bound to the browser (login CSRF) | FV | `auth-service/test/oauth.test.ts` |
| A4 | OAuth callback errors rendered JSON on the API origin | FV | same |
| A5 | OAuth init answered 301 (cacheable) | FV | same |
| A6 | GitHub success redirect had a stray `}` | FN | code fix only (needs a real GitHub app) |
| A7 | Plaintext refresh token stored in Mongo `refreshTokenHash` | FN | assignment removed; old values expire |
| A8 | Gateway logged full URLs, including the OAuth `code` | FN | path-only logging |
| H1 | No deposit, ledger or deposit-status history; no paging beyond 200 rows | FV | `settlement.db.test.ts` (2 new tests) |
| H2 | No way to show the USDC credit before paying | FV | `wallet-service/test/history-query.test.ts` |
| H3 | Deposits never reach FAILED | DEF | needs an expiry job using the Razorpay API (a single `payment.failed` is not terminal) |
