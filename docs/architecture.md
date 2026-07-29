# Architecture

## Overview

Aurax uses a modular backend architecture with separate services for authentication, wallet operations, and real-time communication.

## Components

- API Gateway: central entry point for client requests
- Auth Service: OAuth and JWT/session management
- Wallet Service: deposits, payments, and wallet operations
- WebSocket Service: real-time event delivery over Socket.IO

## Request Flow

1. Client sends a request to the API Gateway.
2. Gateway forwards the request to the appropriate backend service.
3. Service processes the request and returns a response.
4. WebSocket service pushes real-time events to connected clients.
