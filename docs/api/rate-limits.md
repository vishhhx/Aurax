# Rate Limits

## Overview

The API gateway applies request throttling and basic abuse protection for public and protected endpoints.

## Current Policy

- Anonymous requests are limited to avoid abuse.
- Authenticated requests are allowed higher limits depending on service load.

## Recommended Client Behavior

- Retry with exponential backoff on 429 responses.
- Avoid sending repeated requests in short intervals.
