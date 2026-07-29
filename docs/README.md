# Aurax Backend

> Backend services powering the Aurax Centralized Exchange (CEX).

This repository contains the backend services responsible for authentication, wallet management, real-time communication, and future exchange modules.

---

## Documentation

| Document        | Description                     |
| --------------- | ------------------------------- |
| Getting Started | Local setup instructions        |
| Authentication  | JWT authentication flow         |
| Auth API        | Authentication endpoints        |
| Wallet API      | Wallet and payment APIs         |
| WebSocket       | Real-time communication         |
| Error Codes     | Standard error responses        |
| Rate Limits     | Gateway limits                  |
| Architecture    | High-level backend architecture |

---

## Services

| Service           | Description         |
| ----------------- | ------------------- |
| API Gateway       | Public entry point  |
| Auth Service      | User authentication |
| Wallet Service    | Wallet & payments   |
| WebSocket Service | Real-time events    |

---

## Base URLs

Development

```text
REST API
http://localhost:3000/api/v1

WebSocket
ws://localhost:4000
```

---

## Authentication

Protected endpoints require

```text
Authorization: Bearer <access_token>
```

---

## Version

Current API Version

```text
v1
```

---

## Support

For backend-related issues, contact the backend engineering team.
