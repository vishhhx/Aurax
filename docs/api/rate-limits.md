# Rate Limits

> **Superseded (2026-10-26).** This page describes an earlier design and is kept for history.
> The current, code-verified contract is [http-api.md](../frontend-integration/http-api.md#conventions).

## Overview

The API gateway applies request throttling and basic abuse protection for public and protected endpoints.

## Current Policy

- Anonymous requests are limited to avoid abuse.
- Authenticated requests are allowed higher limits depending on service load.

## Recommended Client Behavior

- Retry with exponential backoff on 429 responses.
- Avoid sending repeated requests in short intervals.
