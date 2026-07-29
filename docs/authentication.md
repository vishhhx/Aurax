# Authentication

## Overview

Aurax uses JWT-based authentication for protected API access and socket connections.

## Token Types

- Access Token: used for protected REST API requests
- Refresh Token: used to obtain a new access token

## Authentication Flow

1. Client authenticates through OAuth or session refresh.
2. Server issues access and refresh tokens.
3. Client includes the access token in the Authorization header for protected requests.

## Header Format

```text
Authorization: Bearer <access_token>
```
