# Wallet API

## Overview

The Wallet Service manages deposits, withdrawals, balances, assets, and payment integrations.

Base Route

```text
/api/v1/wallet
```

---

# Authentication

All Wallet APIs require a valid Access Token.

```text
Authorization: Bearer <access_token>
```

---

# Get Assets and Wallet Balances

Fetches all supported assets from the `Asset` table along with the authenticated user's wallet balances (`availableBalance`, `lockedBalance`). If an asset is not yet present in the user's wallet, its balances default to `0`.

## Endpoint

```text
GET /wallet/assets
```

## Authentication

Required (`Authorization: Bearer <access_token>`)

## Success Response

```json
{
  "success": true,
  "data": [
    {
      "assetId": "asset_usdc_123",
      "symbol": "USDC",
      "name": "USD Coin",
      "imageUrl": "https://example.com/usdc.png",
      "decimals": 6,
      "network": "Ethereum",
      "depositEnabled": true,
      "withdrawalEnabled": true,
      "minDeposit": "10.00000000",
      "minWithdrawal": "10.00000000",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "availableBalance": "500.00000000",
      "lockedBalance": "0.00000000"
    },
    {
      "assetId": "asset_btc_456",
      "symbol": "BTC",
      "name": "Bitcoin",
      "imageUrl": "https://example.com/btc.png",
      "decimals": 8,
      "network": "Bitcoin",
      "depositEnabled": true,
      "withdrawalEnabled": true,
      "minDeposit": "0.00100000",
      "minWithdrawal": "0.00100000",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "availableBalance": 0,
      "lockedBalance": 0
    }
  ],
  "message": "Assets and wallet details retrieved successfully",
  "statusCode": 200
}
```

---

# Initialize Deposit

Creates a pending deposit and a Razorpay Order.

## Endpoint

```text
POST /payment/razorpay/init-deposit
```

## Request Body

```json
{
  "amount": 100
}
```

| Field  | Type   | Required | Description           |
| ------ | ------ | -------- | --------------------- |
| amount | number | Yes      | Deposit amount in INR |

---

## Success Response

```json
{
  "success": true,
  "data": {
    "orderId": "order_xxx",
    "currency": "INR",
    "amount": 10000
  }
}
```

---

# Verify Payment

Verifies Razorpay payment signature.

## Endpoint

```text
POST /payment/razorpay/verify
```

## Request

```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature"
}
```

---

## Success Response

```json
{
  "success": true,
  "message": "Payment verified"
}
```

---

# Razorpay Webhook

> Internal Endpoint

This endpoint is called exclusively by Razorpay servers.

Frontend applications must never invoke this endpoint.

```text
POST /payment/razorpay/webhook
```
