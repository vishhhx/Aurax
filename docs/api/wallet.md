# Wallet API

## Overview

The Wallet Service manages deposits, withdrawals, balances, and payment integrations.

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
