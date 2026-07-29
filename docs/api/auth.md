# Authentication API

## Overview

The Authentication Service is responsible for user authentication, OAuth integrations, session management, and token refresh.

Base Path

```text
/api/v1/auth
```

---

# Authentication

Unless explicitly stated, authentication endpoints are public.

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

Receives the authorization code from Google and completes user authentication.

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

| Name  | Type   |
| ----- | ------ |
| code  | string |
| state | string |

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
