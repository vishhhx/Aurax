# Backend API and WebSocket Documentation

This document summarizes the routes exposed through the API gateway, the downstream auth and wallet services, and the Socket.IO listeners in the websocket server.

## 1. API Gateway Overview

The gateway exposes two main route groups:

- Auth routes: /api/v1/auth/*
- Wallet routes: /api/v1/wallet/*

### Important protection note

All wallet routes under /api/v1/wallet/* are protected by the gateway authenticate middleware. That means a valid Bearer access token must be present in the Authorization header before the request reaches the wallet service.

---

## 2. Auth Service Routes (through API Gateway)

These routes are forwarded by the gateway to the auth service.

| Route                               | Method | Auth required                          | Parameters / body                                | Notes                                                      |
| ----------------------------------- | ------ | -------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| /api/v1/auth/oauth2/google          | GET    | No                                     | No body. Optional query params are not required. | Starts Google OAuth flow.                                  |
| /api/v1/auth/oauth2/google/callback | GET    | No                                     | Query param: code                                | Handles the OAuth callback from Google.                    |
| /api/v1/auth/oauth2/github          | GET    | No                                     | No body.                                         | Starts GitHub OAuth flow.                                  |
| /api/v1/auth/oauth2/github/callback | GET    | No                                     | Query params: code, state                        | Handles the OAuth callback from GitHub.                    |
| /api/v1/auth/sessions/refresh       | POST   | No, but requires a valid refresh token | Header: Authorization: Bearer <refresh_token>    | Refreshes the access token and returns a new access token. |

### Example requests

#### Google OAuth start

```bash
curl -X GET http://localhost:<gateway-port>/api/v1/auth/oauth2/google
```

#### Google OAuth callback

```bash
curl -X GET "http://localhost:<gateway-port>/api/v1/auth/oauth2/google/callback?code=your_code"
```

#### GitHub OAuth start

```bash
curl -X GET http://localhost:<gateway-port>/api/v1/auth/oauth2/github
```

#### GitHub OAuth callback

```bash
curl -X GET "http://localhost:<gateway-port>/api/v1/auth/oauth2/github/callback?code=your_code&state=your_state"
```

#### Refresh session token

```bash
curl -X POST http://localhost:<gateway-port>/api/v1/auth/sessions/refresh \
  -H "Authorization: Bearer <refresh_token>"
```

---

## 3. Wallet Service Routes (through API Gateway)

These routes are forwarded by the gateway to the wallet service. Because the gateway applies authenticate before the proxy, all of them require a valid access token.

| Route                                        | Method | Auth required   | Parameters / body                                                                                                                             | Notes                                                                                                                                                                 |
| -------------------------------------------- | ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /api/v1/wallet/payment/razorpay/init-deposit | POST   | Yes             | Header: Authorization: Bearer <access_token>; Body: { "amount": 100 }                                                                         | Creates a deposit order and initializes Razorpay. The amount is converted to paise internally.                                                                        |
| /api/v1/wallet/payment/razorpay/verify       | POST   | Yes             | Header: Authorization: Bearer <access_token>; Body: { "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." } | Verifies the Razorpay payment signature.                                                                                                                              |
| /api/v1/wallet/payment/razorpay/webhook      | POST   | Yes (currently) | Header: x-razorpay-signature; Raw Razorpay webhook payload                                                                                    | This is currently protected by the gateway middleware as well. If Razorpay must call it without a user token, it should be exempted from the authenticate middleware. |

### Example requests

#### Initialize deposit

```bash
curl -X POST http://localhost:<gateway-port>/api/v1/wallet/payment/razorpay/init-deposit \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}'
```

#### Verify payment

```bash
curl -X POST http://localhost:<gateway-port>/api/v1/wallet/payment/razorpay/verify \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_order_id": "order_xxx",
    "razorpay_payment_id": "pay_xxx",
    "razorpay_signature": "signature"
  }'
```

#### Razorpay webhook

```bash
curl -X POST http://localhost:<gateway-port>/api/v1/wallet/payment/razorpay/webhook \
  -H "x-razorpay-signature: <signature>" \
  -H "Content-Type: application/json" \
  -d '{"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": "order_xxx", "id": "pay_xxx"}}}}'
```

> Note: The gateway currently applies authentication to the entire wallet route tree, so the webhook route is also protected by the authenticate middleware.

---

## 4. WebSocket Server Listeners and Events

The websocket server is available at the websocket service and uses JWT-based authentication from the socket handshake.

### Authentication for socket connections

Clients must provide a JWT token either as:

- socket handshake auth: { token: "Bearer <access_token>" }
- or an Authorization header: "Bearer <access_token>"

### Listeners registered on the websocket server

| Event      | Type               | Description                                                                                                     |
| ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| connection | Socket.IO listener | Fired when a client successfully connects. The server authenticates the user and stores the socket ID in Redis. |
| disconnect | Socket.IO listener | Fired when the client disconnects. The server removes the socket ID from Redis.                                 |
| error      | Socket.IO listener | Fired when a socket error occurs. The server logs the error.                                                    |

### Server-emitted events

| Event             | Direction        | Payload                                 |
| ----------------- | ---------------- | --------------------------------------- |
| deposit.completed | Server -> client | { depositId, assetId, amount, balance } |

### Example socket connection

```javascript
const socket = io("http://localhost:<websocket-port>", {
  auth: {
    token: "Bearer <access_token>",
  },
});
```

---

## 5. Route Protection Summary

| Area                 | Protected by gateway authenticate middleware? | Notes                                                             |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| /api/v1/auth/*       | No                                            | Public auth routes and token refresh flow.                        |
| /api/v1/wallet/*     | Yes                                           | All wallet routes are protected and require a valid access token. |
| WebSocket connection | Yes                                           | Socket connection requires a valid JWT token.                     |
