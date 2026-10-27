# Environments

> **Superseded (2026-10-26).** This page describes an earlier design and is kept for history.
> The current, code-verified contract is [frontend-environment.md](frontend-integration/frontend-environment.md).

## Development

- REST API: http://localhost:3000/api/v1
- WebSocket: ws://localhost:4000

## Production

Set production-safe environment variables and secrets before deployment.

## Recommended Variables

- JWT access secret
- JWT refresh secret
- Auth service URL
- Wallet service URL
- Frontend URL
