# HTTP API

Verified against the route files on 2026-10-26. The machine-readable version is
[openapi.yaml](openapi.yaml).

## Conventions

**Base URL.** `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:5000`
(api-gateway). The gateway strips the mount path, so `/api/v1/order/abc`
reaches order-service as `/abc`.

| Prefix | Service | Auth |
|---|---|---|
| `/api/v1/auth` | auth-service | mixed (see each route) |
| `/api/v1/wallet` | wallet-service | **all routes** except `/webhook/razorpay` |
| `/api/v1/order` | order-service | **all routes** |
| `/api/v1/market` | market-service | none (public) |

**Credentials.** Use `withCredentials: true` (axios) or
`credentials: "include"` (fetch). Each service reads the access token from the
`accessToken` HttpOnly cookie, or from `Authorization: Bearer <token>`. See
[authentication.md](authentication.md).

**Envelope.** Every JSON response uses this shape:

```json
{ "success": true, "data": {}, "message": "Human readable", "statusCode": 200 }
```

`statusCode` is present on most auth, wallet and order responses, but absent
on market responses.

Errors use the same envelope:

```json
{ "success": false, "data": null, "message": "Validation failed",
  "errors": [{ "field": "price", "message": "Price is required for LIMIT orders" }] }
```

The contents of `errors` vary by service:
- Order body validation returns `{field, message}` pairs.
- Order rule failures return `{field, message: "TICK_SIZE" | "STEP_SIZE" | "MIN_NOTIONAL" | ...}`.
- Reservation failures return `[{code}]`.
- Market-service returns a list of strings.
- Wallet history validation returns raw zod issues.

Show `message` to the user, and branch on the HTTP status and `errors[].code` or `errors[].message`.

**Numbers.** Prices, quantities, balances, fees and volumes are **decimal
strings**, such as `"0.0012"`. Never parse them into JS floats for arithmetic
or comparison. Timestamps are ISO-8601 strings in order, wallet and auth
responses, and Unix milliseconds in market responses.

**Symbols.** Use the canonical form `BTCUSDC`. Order and market endpoints also
accept `BTC-USDC`, `BTC_USDC` and `BTC/USDC` in any case.

**Paging.**
- Order, trade, deposit and ledger history are newest-first. To get the next
  page, pass `before=<id of the last row you received>`. A page shorter than
  `limit` is the last page. An id that is not one of the caller's rows returns
  400.
- Market `historical-trades` uses an opaque `cursor` / `nextCursor` instead.

**Status codes.**

| Code | Meaning |
|---|---|
| 200 | OK |
| 202 | Accepted; asynchronous processing (orders and cancels) |
| 400 | Validation or business rule failure |
| 401 | Missing, invalid or expired token; refresh once, then send the user to login |
| 404 | Unknown resource, or one the caller does not own |
| 409 | Conflict (order already terminal, duplicate reference) |
| 429 | Rate limited (gateway); `Retry-After` is set |
| 502 / 504 | Upstream service unavailable or timed out (gateway) |
| 503 | market-service not ready yet, or wallet reservation unavailable |

**Rate limits** (gateway, per IP, fixed 60s window, in memory per gateway instance):
- `RATE_LIMIT_PER_MIN` (default 600) applies to all requests.
- `WRITE_RATE_LIMIT_PER_MIN` (default 120) additionally applies to
  non-GET wallet and order requests.

Responses carry `RateLimit-Limit` and `RateLimit-Remaining`, and a 429 also
carries `Retry-After` in seconds. All three are CORS-exposed.

---

## Auth: `/api/v1/auth`

### `GET /oauth2/google` · `GET /oauth2/github`: public

Returns the provider authorization URL. Navigate the browser to `data`.

```json
200 { "success": true, "data": "https://accounts.google.com/o/oauth2/v2/auth?...", "message": "Successfully initialized Google OAuth2", "statusCode": 200 }
```

The response also sets an HttpOnly `oauthState` cookie, and the URL carries
the matching `state`, valid for 5 minutes and usable once. Call this endpoint
**with credentials**, right before navigating to the URL.

### `GET /oauth2/google/callback` · `GET /oauth2/github/callback`: provider only

These are browser redirects from the provider, never called by JS.
- On success, the backend sets the `accessToken` and `refreshToken` cookies
  and sends **302 → `${FRONTEND_URL}/auth/success`**.
- On any failure, it sends **302 → `${FRONTEND_URL}/login?error=auth_failed`**
  with no cookies set.

### `POST /sessions/refresh`: refresh cookie

Rotates the refresh session, sets both cookies again and returns a new access
token. The body is empty.

```json
200 { "success": true, "data": { "accessToken": "<jwt>" }, "message": "Token refreshed successfully.", "statusCode": 200 }
401 "Refresh token is required." | "Invalid or expired refresh token." | "Invalid refresh token." | "User not found."
```

Each refresh token works once. Reusing a rotated token returns 401.

### `POST /sessions/logout`: refresh cookie (optional)

Revokes the refresh session in Redis and clears both cookies. It is
idempotent: it always returns 200, even with no cookie, an expired cookie or
an already revoked one.

```json
200 { "success": true, "data": null, "message": "Logged out.", "statusCode": 200 }
```

### `GET /details` (alias `GET /user-details`): access token

```json
200 { "success": true, "statusCode": 200, "message": "User details retrieved successfully",
  "data": { "userId": "65f0c0ffee0000000000abcd", "email": "user@example.com", "name": "Ada",
            "provider": "google", "isEmailVerified": true,
            "lastLogin": "2026-10-26T09:00:00.000Z", "createdAt": "2026-10-01T12:00:00.000Z" } }
401 "Access token required" | "Invalid or expired access token"   404 "User not found"
```

The response is cached in Redis for up to 1 hour.

---

## Wallet: `/api/v1/wallet` (access token)

### `GET /assets`

Returns every listed asset, with the caller's balances (`"0"` if the caller
has no wallet for it).

```json
200 { "success": true, "statusCode": 200, "message": "Assets and wallet details retrieved successfully",
  "data": [ { "assetId": "cmabc...", "symbol": "USDC", "name": "USD Coin", "imageUrl": "https://…",
              "decimals": 8, "network": null, "depositEnabled": true, "withdrawalEnabled": true,
              "minDeposit": "0", "minWithdrawal": "0",
              "createdAt": "…", "updatedAt": "…",
              "availableBalance": "94.98", "lockedBalance": "10.02" } ] }
```

- `locked` is held by open orders.
- `availableBalance + lockedBalance` is the total.
- `withdrawalEnabled` is metadata only: no withdrawal API exists.

### `GET /payment/razorpay/quote?amount=<INR>`: new

Returns the USDC that `init-deposit` would credit for this INR amount. It
uses the same validation and rounding, and has no side effects. Show it
before the user pays.

```json
200 { "success": true, "statusCode": 200, "message": "Deposit quote",
  "data": { "amount": "500.00", "currency": "INR", "asset": "USDC", "creditAmount": "5.22356874",
            "rate": "95.72", "minAmount": "100", "maxAmount": "500000" } }
400 same messages as init-deposit
```

`rate` is a configured indicative rate (`USDC_INR_RATE`), not a live market
price. Label it as such in the UI.

### `POST /payment/razorpay/init-deposit`

Request body: `{ "amount": "500" }`. The amount is INR, as a string or number,
with at most 2 decimals, between 100 and 500000.

The backend:
1. creates a PENDING USDC deposit of `amount / USDC_INR_RATE`, rounded down to 8 decimal places;
2. creates the Razorpay order;
3. returns the **Razorpay order object** unchanged, where `receipt` is the Aurax `depositId`:

```json
200 { "success": true, "statusCode": 200, "message": "Successfully initialized deposit",
  "data": { "id": "order_XXXXXXXX", "entity": "order", "amount": 50000, "currency": "INR",
            "receipt": "cmdep...", "status": "created", "...": "other Razorpay fields" } }
400 "amount must be an INR value with at most 2 decimals" | "amount must be between 100 and 500000 INR"
```

Open Razorpay Checkout with `data.id` and the public key `NEXT_PUBLIC_RAZORPAY_KEY`.

### `POST /payment/razorpay/verify`

Request body: `{ "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`.
These are the values Checkout returns.

This call checks the signature and marks the deposit CONFIRMING. It **does
not credit funds**: the signed webhook does that.

```json
200 { "success": true, "statusCode": 200, "message": "Payment verified; awaiting confirmation",
  "data": { "depositId": "cmdep...", "orderId": "order_XXXXXXXX", "paymentId": "pay_XXXXXXXX", "verified": true, "status": "CONFIRMING" } }
400 "Invalid payment signature" | missing fields     404 "Deposit not found"
```

`status` is `COMPLETED` if the webhook arrived first.

### `GET /deposits?status&limit&before`: new

- `status` is one of `PENDING | CONFIRMING | COMPLETED | FAILED`.
- `limit` is 1–200 (default 50).
- `before` is a `depositId`.

```json
200 { "success": true, "statusCode": 200, "message": "Deposits fetched",
  "data": [ { "depositId": "cmdep...", "assetId": "cmabc...", "asset": "USDC", "amount": "5.95238095",
              "status": "COMPLETED", "method": "RAZORPAY",
              "providerOrderId": "order_XXXXXXXX", "providerPaymentId": "pay_XXXXXXXX",
              "createdAt": "…", "completedAt": "…" } ] }
```

`FAILED` is never set today (see [missing-backend-capabilities.md](missing-backend-capabilities.md)).

### `GET /deposits/:depositId`: new

Returns one deposit, in the same shape as above, for status polling after
checkout. Responds 404 if it does not exist or belongs to someone else.

### `GET /ledger?assetId&referenceType&limit&before`: new

Returns every balance movement, newest first:
- `referenceType` is one of `DEPOSIT | WITHDRAWAL | TRADE | FEE | ADJUSTMENT`;
- `assetId` is the asset cuid from `/assets`;
- `before` is a `ledgerId`.

```json
200 { "success": true, "statusCode": 200, "message": "Ledger fetched",
  "data": [ { "ledgerId": "cmled...", "assetId": "cmabc...", "asset": "USDC", "entryType": "DEBIT",
              "amount": "0.02", "referenceType": "FEE", "referenceId": "<executionId>", "createdAt": "…" } ] }
```

How to read the entries:
- `entryType` is `CREDIT` or `DEBIT`, and `amount` is always positive.
- A trade writes up to 3 rows sharing the execution's `referenceId`: base,
  quote and fee.
- Reservations (locks) are **not** ledger entries; they show up only in
  `lockedBalance`.

### `POST /webhook/razorpay`: Razorpay only

This endpoint needs no token: it checks an HMAC over the raw body
(`x-razorpay-signature`). Never call it from the frontend.

---

## Orders: `/api/v1/order` (access token)

### `POST /`: place an order

```json
{ "symbol": "BTCUSDC", "side": "BUY", "orderType": "LIMIT", "price": "65000", "quantity": "0.001",
  "timeInForce": "GTC", "postOnly": false }
```

Rules (see `order.schema.ts` and `services/order-rules.ts`):

| Field | Rule |
|---|---|
| `price` | required for LIMIT, forbidden for MARKET, a multiple of `tickSize`, within `[minPrice, maxPrice]` |
| `quantity` | a multiple of `stepSize`, within `[minQuantity, maxQuantity]` |
| notional | `price × quantity ≥ minNotional` (LIMIT) |
| `timeInForce` | `GTC` (default) \| `IOC` \| `FOK`; MARKET orders are forced to IOC |
| `postOnly` | LIMIT + GTC only; rejected by the engine if it would take liquidity |
| MARKET BUY | **rejected with 400** (the engine has no quote budget); MARKET SELL is allowed |
| market status | must be `TRADING` |

Market rules come from `GET /api/v1/market/markets/:symbol`.

The reservation is held until the order closes:
- BUY reserves `price × quantity × (1 + max(makerFee, takerFee))` of the quote
  asset, rounded up to 8 decimal places;
- SELL reserves `quantity` of the base asset.

```json
202 { "success": true, "statusCode": 202, "message": "Order accepted",
  "data": { "order": { "orderId": "cmord...", "symbol": "BTCUSDC", "side": "BUY", "orderType": "LIMIT",
                       "price": "65000", "quantity": "0.001", "executedQuantity": "0", "remainingQuantity": "0.001",
                       "averagePrice": null, "timeInForce": "GTC", "postOnly": false, "status": "PENDING",
                       "createdAt": "…", "updatedAt": "…" },
            "reserved": { "assetId": "cmabc...", "amount": "65.13" } } }
400 Validation failed | rule failure | "Insufficient available balance" ({code: INSUFFICIENT_BALANCE})
    | "No balance for this asset; deposit first" ({code: WALLET_NOT_FOUND})
404 "Market not found: X"    409 duplicate reference    503 "Unable to reserve balance; try again"
```

`PENDING` means accepted but not yet seen by the engine. The order then moves
through `OPEN`, `PARTIALLY_FILLED`, and finally one of `FILLED`, `CANCELLED`
or `REJECTED`. `EXPIRED` exists in the schema but is never set.

### `GET /?status&symbol&limit&before`

- `status` is `open` (PENDING, OPEN, PARTIALLY_FILLED), `closed` (FILLED,
  CANCELLED, REJECTED, EXPIRED) or `all` (default).
- `limit` is 1–200 (default 50).
- `before` is an `orderId`.

The response `data` is an array of order objects, in the same shape as above.

### `GET /:orderId`

Returns the order object plus `fills: Trade[]`. Responds 404 if the order
does not exist or is not the caller's.

### `DELETE /:orderId`

Requests cancellation of the unfilled remainder.

```json
202 { "success": true, "statusCode": 202, "message": "Cancellation requested", "data": { "...order (still active)": "" } }
404 "Order not found"    409 "Order is already filled" ({status})
```

The outcome arrives later, either as `order.cancelled` (the remaining
reservation is released) or as `order.cancel_rejected` if the order filled
first.

### `GET /trades?symbol&limit&before`

Returns the caller's fills, newest first. `before` is a `tradeId`.

```json
200 { "data": [ { "tradeId": "cmord...-f1-taker", "executionId": "cmord...-f1", "orderId": "cmord...",
                  "symbol": "BTCUSDC", "side": "BUY", "liquidity": "TAKER", "price": "65000", "quantity": "0.001",
                  "quoteAmount": "65", "fee": "0.13", "feeAsset": "cmabc...", "createdAt": "…" } ] }
```

- The fee is always charged in the **quote** asset, and `feeAsset` is an
  asset id.
- `executionId` is the engine trade id, so both sides of one execution share it.

---

## Market data: `/api/v1/market` (public)

Every data route returns 503 until market-service has loaded its state.

| Route | `data` |
|---|---|
| `GET /markets` | `MarketInfo[]` |
| `GET /markets/:symbol` | `MarketInfo` |
| `GET /markets/:symbol/status` | `{symbol, status, orderBookSequenceNumber, orderBookUpdatedAt, lastTradeTimestamp}` |
| `GET /markets/:symbol/orderbook?limit=1..500` (or `?view=published`) | `{symbol, sequenceNumber, bids, asks, depth, updatedAt}` |
| `GET /markets/:symbol/bookTicker` | `{symbol, bidPrice, bidQuantity, askPrice, askQuantity, sequenceNumber}` |
| `GET /tickers` | `Ticker[]` (markets with a loaded ticker) |
| `GET /markets/:symbol/ticker` (alias `/ticker/24hr`) | `Ticker` |
| `GET /markets/:symbol/price` | `{symbol, price \| null, timestamp \| null}` |
| `GET /markets/:symbol/candles?interval=1m\|5m\|15m\|1h\|1d&limit=1..1000&startTime&endTime` | `Candle[]` oldest first |
| `GET /markets/:symbol/trades?limit` | `PublicTrade[]` newest first (from memory) |
| `GET /markets/:symbol/historical-trades?limit=1..1000&startTime&endTime&cursor` | `{trades, nextCursor, limit}` |
| `GET /markets/:symbol/trades/:tradeId` | `PublicTrade` |
| `GET /health`, `/health/live`, `/health/ready`, `/metrics` | ops |

```jsonc
// MarketInfo
{ "marketId": "cmmkt...", "symbol": "BTCUSDC", "baseAsset": "BTC", "quoteAsset": "USDC", "status": "TRADING",
  "tickSize": "0.01", "stepSize": "0.00001", "minPrice": "0.01", "maxPrice": "1000000",
  "minQuantity": "0.00001", "maxQuantity": "100", "minNotional": "1",
  "makerFee": "0.001", "takerFee": "0.002", "pricePrecision": 2, "quantityPrecision": 5 }
// Ticker (rolling 24h; null fields until the first trade)
{ "symbol": "BTCUSDC", "lastPrice": "65000", "openPrice": "64000", "highPrice": "65500", "lowPrice": "63900",
  "priceChange": "1000", "priceChangePercent": "1.5625", "volume": "1.2", "quoteVolume": "78000",
  "tradeCount": 42, "lastTradeTimestamp": 1793000000000, "windowStart": 1792913600000,
  "sequenceNumber": "57", "updatedAt": 1793000000000 }
// Candle
{ "symbol": "BTCUSDC", "interval": "1m", "openTime": 1793000040000, "closeTime": 1793000099999,
  "open": "65000", "high": "65010", "low": "64990", "close": "65005",
  "baseVolume": "0.3", "quoteVolume": "19501.5", "tradeCount": 4, "isClosed": false }
// PublicTrade (side = taker side)
{ "tradeId": "cmord...-f1", "symbol": "BTCUSDC", "price": "65000", "quantity": "0.001",
  "quoteQuantity": "65", "side": "BUY", "isBuyerMaker": false, "timestamp": 1793000000000 }
// Order book level
{ "price": "65000", "quantity": "0.5" }   // bids descending, asks ascending
```

`priceChangePercent` is a percentage, so `"1.5625"` means 1.5625%.

---

## Ops

| Route | Service |
|---|---|
| `GET /health` (gateway, :5000) | gateway liveness (does not check upstreams) |
| `GET /api/v1/market/health/ready` | market-service readiness |
| `GET /health` on wallet, order (internal ports) | liveness |
| `GET /metrics` on websockets (:5005) | Prometheus text |
