# WebSocket API

## Overview

The WebSocket Service provides real-time communication between backend services and authenticated clients.

---

## Connection URL

```text
ws://localhost:4000
```

---

## Authentication

JWT authentication is performed during the Socket.IO handshake.

```javascript
const socket = io("http://localhost:4000", {
  auth: {
    token: "Bearer ACCESS_TOKEN",
  },
});
```

---

# Connection Lifecycle

```text
Client

↓

Socket.IO Connection

↓

JWT Validation

↓

User Authentication

↓

Socket Registration

↓

Realtime Communication

↓

Disconnection

↓

Socket Cleanup
```

---

# Events

## deposit.completed

Emitted after a successful deposit.

### Payload

```json
{
  "depositId": "dep_xxx",
  "assetId": "INR",
  "amount": 100,
  "balance": 500
}
```

### Example

```javascript
socket.on("deposit.completed", (payload) => {
  console.log(payload);
});
```

---

## connect

```javascript
socket.on("connect", () => {});
```

---

## disconnect

```javascript
socket.on("disconnect", () => {});
```

---

## connect_error

```javascript
socket.on("connect_error", (error) => {});
```
