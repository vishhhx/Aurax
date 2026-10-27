# Missing backend capabilities

Last updated 2026-10-26. Everything under **Remaining gaps** is a
**proposal**: none of it exists, and the frontend must not call it.
Endpoints sketched here are marked `x-status: proposed` in
[openapi.yaml](openapi.yaml), or are left out of it.

## Added in this pass (implemented and tested)

| Change | Where | Why | Tests |
|---|---|---|---|
| `POST /auth/sessions/logout` (idempotent, revokes the Redis session, clears cookies) | auth-service `session.controller.ts` | the frontend already called it, but it was a 404 | `auth-service/test/sessions.test.ts` |
| OAuth `state` bound to the browser (HttpOnly `oauthState` cookie + single-use Redis key, atomic) for **Google and GitHub** | `utils/oauth-state.ts` | Google had no `state`; GitHub's was not tied to the browser (login CSRF) | `auth-service/test/oauth.test.ts` |
| OAuth callback failure → `302 /login?error=auth_failed` | `oauth.controller.ts` | failures showed raw JSON on the API origin | same |
| OAuth init returns 200 instead of 301 | `oauth.controller.ts` | a 301 is cacheable and could replay a stale `state` | same |
| GitHub success redirect fixed (`/auth/success}` → `/auth/success`) | `oauth.controller.ts` | GitHub logins landed on a 404 | — |
| Unique `jti` on every JWT | `packages/core/src/jwt.ts` | two tokens issued in the same second were identical, so rotation did not rotate and sessions collided | `sessions.test.ts` (rotation and reuse) |
| Plaintext refresh token no longer copied into the Mongo user (`refreshTokenHash`) | `oauth.controller.ts` | unused copy of a live credential | — |
| `register()` creates one user, not two | `services/auth.ts` | latent bug (not routed yet) | — |
| `GET /wallet/deposits`, `GET /wallet/deposits/:id` | wallet `history.controller.ts` | deposit history and status polling | `settlement.db.test.ts` |
| `GET /wallet/ledger` | same | balance movement history | `settlement.db.test.ts` |
| `GET /wallet/payment/razorpay/quote` | `deposit.controller.ts` | show the credited USDC and rate before paying | `wallet-service/test/history-query.test.ts` |
| `verify` response includes `depositId` | `deposit.controller.ts` | link checkout to `GET /deposits/:id` | — |
| `before=<id>` keyset paging on `/order`, `/order/trades`, `/wallet/deposits`, `/wallet/ledger` | order and wallet repositories | history beyond 200 rows | `settlement.db.test.ts` (pages equal the full list) |
| Indexes `Deposit(userId, createdAt)`, `Ledger(userId, createdAt)` | migration `20261026090000_history_pagination_indexes` | history query plans | applied to the isolated test DB and the dev DB (additive) |
| `/wallet/assets` balances are always decimal strings (`"0"`, not `0`) | `wallet.controller.ts` | one numeric type for clients | — |
| Gateway logs the path only (no query string) | `api-gateway/src/proxy/proxy.ts` | OAuth `code` was logged | — |
| `RateLimit-*` and `Retry-After` CORS-exposed | `api-gateway/src/app.ts` | the browser can back off | — |

## Remaining gaps

Priority: **P1** blocks a core CEX flow, **P2** is expected by users, **P3**
is nice to have.

### 1. Withdrawals (P1)

**State:** nothing exists. The schema has `LedgerReferenceType.WITHDRAWAL`,
`WalletTransactionType.WITHDRAW`, `Asset.withdrawalEnabled` and
`minWithdrawal`, but no table, API, event or job.

**Why not implemented here:** it needs product and custody decisions that
can't be inferred from the code:
- payout rail (Razorpay payouts for INR? on-chain USDC?);
- fee schedule;
- limits and KYC;
- address whitelisting;
- 2FA confirmation;
- manual review;
- hot-wallet signing.

Building any of it now would invent financial semantics.

**UI:** show withdrawals as unavailable. Do not build a form.

**Proposal:**
1. A `Withdrawal` table (`PENDING_REVIEW → APPROVED → PROCESSING → COMPLETED | REJECTED | FAILED`).
2. `POST /wallet/withdrawals` moves the amount plus fee from available to
   locked, using the existing reservation primitive.
3. A processor job settles the withdrawal (debit locked, Ledger `WITHDRAWAL`
   and `FEE`) or releases it.
4. `GET /wallet/withdrawals`.
5. `balance.updated` with `reason: WITHDRAWAL`.
6. A `withdrawal.updated` private event.

### 2. Email/password accounts and recovery (P2)

**State:** `AuthService.register/login` exist (bcrypt) but are not routed.
There is no email verification, no reset, and no login throttling.

**UI:** keep the email forms disabled, with "Use Google or GitHub".

**Proposal:**
- `POST /auth/register` and `POST /auth/login`, with per-account and per-IP
  throttling;
- `POST /auth/email/verify`;
- `POST /auth/password/forgot` and `/reset`, using single-use tokens stored
  hashed in Redis.

All of this needs an email provider.

### 3. Deposit failure and expiry (P2)

**State:** the webhook handles only `payment.captured`. Nothing ever sets
`FAILED`, so abandoned or failed checkouts stay `PENDING` forever.

A single `payment.failed` is **not** terminal: Razorpay lets the user retry
on the same order. Marking `FAILED` on the first failure would be wrong.

**UI:** show `PENDING` as "Awaiting payment". Offer a fresh deposit instead
of resuming an old one.

**Proposal:** a periodic job that expires deposits still `PENDING` or
`CONFIRMING` after N hours. It confirms with the Razorpay Orders API that no
payment was captured, then sets `FAILED`. The status transition stays guarded
the same way `completePayment` is.

### 4. Live conversion rate (P3)

**State:** `USDC_INR_RATE` is a static env value, now exposed by `/quote`.

**Proposal:** a rate source with a quote id and expiry, honoured by
`init-deposit`.

### 5. MARKET BUY (P2)

**State:** rejected with 400. The engine matches by base quantity and cannot
bound a buyer's quote spend, so the reservation can't be sized safely.

**UI:** disable "Market" for Buy, or offer "Limit at best ask + X%" as an
explicit LIMIT IOC.

**Proposal:** a `quoteOrderQty` budget carried in the engine command. The
engine stops filling when the budget is exhausted, and the leftover is
released.

### 6. Order management extras (P3)

None of these exist:
- stop / stop-limit / OCO / trailing stops;
- amend;
- `DELETE /order?symbol=` (cancel all);
- order expiry (`EXPIRED` and GTD).

Cancel-all can be done client-side by iterating `DELETE /order/:id`, and
each cancel is independently idempotent.

### 7. Account security (P2)

None of these exist:
- 2FA/TOTP;
- a list of active sessions (Redis has `session:<token>` but no per-user index);
- revoke other sessions;
- "log out everywhere";
- API keys;
- login history.

**Proposal:**
1. Index sessions per user: a Redis set `user:sessions:<userId>`.
2. Add `GET /auth/sessions` and `DELETE /auth/sessions/:id`, keyed by an
   opaque session id, **never the token**.
3. Add a TOTP enrol/verify flow, required for withdrawals (#1).

### 8. Public asset metadata (P3)

**State:** asset names and logos are only available through the
authenticated `GET /wallet/assets`. Public `/market/markets` gives asset
symbols only.

**UI:** on public pages, render symbols with a neutral monogram.

**Proposal:** a public `GET /market/assets` (`symbol, name, imageUrl, decimals`).

### 9. Portfolio valuation and PnL (P3)

**State:** none. The client can value a balance as `amount ×
lastPrice(<ASSET>USDC)` where that market exists; USDC is valued at 1.
Cost basis and PnL require a defined accounting method (FIFO or average), a
product decision.

**UI:** label totals "Estimated value (USDC)" and show "—" for assets without
a USDC market.

### 10. Internal service authentication (P2, ops)

**State:** wallet, order, market and auth services listen on their own ports
and trust network placement plus the user JWT. The gRPC servers have no auth.

**Proposal:** bind internal ports to a private network only, and add mTLS or
a shared internal token for gRPC. This doesn't affect the frontend, but must
be done before deployment.

### 11. Access token revocation (P3)

Access tokens remain valid for up to 15 minutes after logout. This is an
accepted trade-off of stateless JWTs. If needed: a Redis deny-list by `jti`,
checked in each auth middleware.

### 12. Profile, preferences, watchlist (P3)

None of these exist:
- profile edit;
- notification preferences;
- a server-side favourites/watchlist;
- account deletion.

A watchlist can live in `localStorage`, labelled per device.
