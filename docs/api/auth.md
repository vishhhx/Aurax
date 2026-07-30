# Authentication API

## Overview

The Authentication Service is responsible for user authentication, OAuth integrations, session management, token refresh, and user details retrieval.

Base Path

```text
/api/v1/auth
```

---

# Authentication

Unless explicitly stated, authentication endpoints are public. Protected endpoints require a valid Access Token passed in the `Authorization` header (`Bearer <access_token>`) or `accessToken` cookie.

---

# Google OAuth

Initiates the Google OAuth flow.

## Endpoint

```text
GET /oauth2/google
```

## Authentication

Not Required

## Request

No request body.

## Response

Redirects the client to Google's OAuth consent page.

---

# Google OAuth Callback

## Endpoint

```text
GET /oauth2/google/callback
```

## Query Parameters

| Name | Type   | Required |
| ---- | ------ | -------- |
| code | string | Yes      |

## Description

Receives the authorization code from Google, authenticates or registers the user, sets authentication cookies, and redirects the browser to the frontend completion page:
`${FRONTEND_URL}/auth/success?user=<encrypted_user_payload>&userId=<userId>`

The `user` query parameter contains an AES-256-GCM encrypted payload with user details (`userId`, `email`, `name`) for secure client persistence.

---

# GitHub OAuth

## Endpoint

```text
GET /oauth2/github
```

---

# GitHub Callback

## Endpoint

```text
GET /oauth2/github/callback
```

## Query Parameters

| Name  | Type   | Required |
| ----- | ------ | -------- |
| code  | string | Yes      |
| state | string | Yes      |

## Description

Receives the authorization code and state from GitHub, completes authentication, sets cookies, and redirects to:
`${FRONTEND_URL}/auth/success?user=<encrypted_user_payload>&userId=<userId>`

The `user` query parameter contains an AES-256-GCM encrypted payload with user details (`userId`, `email`, `name`) for secure client persistence.

---

# Get User Details

Retrieves user profile details with Redis string caching (`@repo/redis`).

## Endpoint

```text
GET /auth/details
```

## Authentication

Required (`Authorization: Bearer <access_token>` or cookie `accessToken`)

## Caching Strategy

User details are cached in Redis using the string key format `user:details:<userId>` with a 1-hour expiration TTL. If a cache miss occurs, details are retrieved from the database and populated into Redis.

## Success Response

```json
{
  "success": true,
  "data": {
    "userId": "66a7b3c2d4e5f67890123456",
    "email": "user@example.com",
    "name": "John Doe",
    "provider": "google",
    "isEmailVerified": true,
    "lastLogin": "2026-07-29T18:27:00.000Z",
    "createdAt": "2026-07-29T12:00:00.000Z"
  },
  "message": "User details retrieved successfully",
  "statusCode": 200
}
```

## Error Responses

| Status | Description |
| ------ | ----------- |
| 401 | Access token required / invalid |
| 404 | User not found |

---

# Refresh Session

Generates a new Access Token using a valid Refresh Token.

## Endpoint

```text
POST /sessions/refresh
```

## Headers

```text
Authorization: Bearer <refresh_token>
```

## Success Response

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "expiresIn": 3600
  }
}
```

## Error Responses

| Status | Description           |
| ------ | --------------------- |
| 401    | Invalid refresh token |
| 403    | Expired refresh token |
