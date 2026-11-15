# 7. Reliability

Aurax assumes things go wrong: messages arrive twice, processes crash halfway,
networks drop. This page explains how each problem is handled.

## The basic stance

- **Every delivery is at-least-once.** Kafka, the outbox relay and socket.io
  can all deliver twice.
- **Every consumer that changes state is idempotent.** It can safely see the
  same event again.
- **Every event has a deterministic id**, made from what the event is about,
  not from a random number or a time.

## Idempotency keys

| Where | Key | Mechanism |
|---|---|---|
| Engine, `order.created` | `create:<orderId>` | Recent-command set (50k per market, saved in snapshots) |
| Engine, `order.cancel_requested` | `cancel:<orderId>` | Same |
| Engine fill ids | `<takerOrderId>-f<n>` | Deterministic, so a replay gives the same id |
| order-service settlement | `Trade.executionId` | Checked first; the `Trade` PK catches a race (`P2002` → duplicate) |
| order-service open | `status = PENDING` condition | `updateMany` with a condition |
| order-service close | Order already terminal → no-op | Row lock + status check |
| wallet `ReserveBalance` | `referenceId` | Unique column; the same params return the existing row |
| wallet `ReleaseBalance` | reservation status | Releasing twice succeeds and does nothing |
| Deposit credit | deposit status | Conditional `PENDING/CONFIRMING → COMPLETED` |
| market-service trades | `MarketTrade.tradeId` PK | Insert-if-absent; only new rows change state |
| market-service book | book sequence number | Stale updates ignored |
| websockets / browser | `eventId`, depth `sequenceNumber`, balance `version` | Seen-id sets, sequence checks, highest version wins |

## Transactional outbox

**Problem:** "write to the DB, then publish to Kafka" can fail between the two
steps. Then the DB says one thing and Kafka never hears about it, or the
opposite.

**Solution** (`packages/postgres/src/outbox.ts`):

```mermaid
sequenceDiagram
  participant S as Service code
  participant PG as Postgres
  participant R as OutboxRelay
  participant K as Kafka

  S->>PG: BEGIN
  S->>PG: business change (order, wallet, deposit, ...)
  S->>PG: INSERT OutboxEvent (topic, key, payload)
  S->>PG: COMMIT  (both or neither)
  loop every 200ms (0ms while there is a backlog)
    R->>PG: BEGIN; pg_try_advisory_xact_lock(RELAY_LOCK_KEY)
    alt got the lock
      R->>PG: SELECT ... WHERE publishedAt IS NULL ORDER BY createdAt, id LIMIT 200 FOR UPDATE
      R->>K: send, grouped in runs by topic, in order (acks=-1)
      R->>PG: UPDATE publishedAt = now(), attempts += 1
      R->>PG: COMMIT
    else another relay has it
      R->>PG: COMMIT (do nothing)
    end
  end
```

- The event exists **if and only if** the change committed.
- Only **one relay publishes at a time** in the whole system (one global
  advisory lock), so per-key order is kept even with many service instances.
  order-service and wallet-service both run a relay, and whichever holds the
  lock publishes rows from **both** services, because the table is shared.
- If the relay crashes after sending but before marking rows, they are sent
  again. Consumers dedupe by `eventId`.
- On errors the relay backs off exponentially, up to 30s.
- On shutdown it does a final flush.
- Disable a relay with `OUTBOX_RELAY=false`.

The **engine has no outbox**. It has no database. Its safety comes from the
deterministic replay described in
[Matching engine → Crash recovery](04-matching-engine.md#crash-recovery).

## Stopping double spending

1. `ReserveBalance` is one SQL statement:
   `UPDATE Wallet SET available = available - x, locked = locked + x WHERE … AND available >= x`.
   If two requests race, Postgres runs them one after the other, and the
   second one updates 0 rows → `INSUFFICIENT_BALANCE`.
2. CHECK constraints reject any negative balance, as a second line of defence.
3. The order row is created only after the reservation succeeds. If the order
   insert fails, `ReleaseBalance` gives the money back.
4. Settlement locks the order and reservation rows (`SELECT … FOR UPDATE`) and
   checks that the reservation covers the payment.

## Failure modes

| What fails | What happens | How it recovers |
|---|---|---|
| wallet gRPC down at order time | `503`, nothing created | User retries |
| Order insert fails after reserve | `500`; `ReleaseBalance` called | If the release also fails, it is logged; `reconcileWallets` finds the orphan |
| order-service crashes after commit, before relay | Event is in the outbox | Any relay publishes it later |
| Relay crashes after send, before mark | Event sent twice | Consumers dedupe |
| Engine shard crashes | Supervisor restarts it in 2s | Snapshot + replay; `RECOVERY` until caught up |
| Kafka data wiped | Snapshots point past the log end | Snapshots discarded, full live replay |
| Kafka retention removed needed commands | — | **Shard refuses to start** (manual action needed) |
| Settlement throws (`InvariantError`) | Transaction rolled back, message not committed | kafkajs retries. A real bug will block that partition until fixed |
| Cancel arrives before its fill is settled | `closeOrder` throws | Retried until the fill is settled |
| market-service misses book updates | Sequence gap | Full book on the next event; reload with gRPC on regression; 30s periodic snapshot |
| websockets misses depth deltas | Gap detected | REST resync from market-service, or the next Kafka snapshot; client gets `resync` |
| Browser disconnects | Missed events | Socket reconnects; app re-fetches REST state on each new `epoch` |
| Upstream service down behind gateway | JSON `502`/`504` within 10s | Client retries |
| Razorpay webhook sent twice | Second one finds `COMPLETED` | No second credit |
| Consumer crash in market-service / websockets | Supervised consumer restarts with backoff | Health shows `crashed` meanwhile |

## Reconciliation

`reconcileWallets(userIds?)` (`packages/postgres/src/reconcile.ts`) returns
every wallet that breaks an invariant:

- `LEDGER_MISMATCH`: `available + locked ≠ Σ credits − Σ debits`.
  Reservations move money between available and locked without a ledger
  entry, so they do not affect this.
- `LOCKED_MISMATCH`: `locked ≠ Σ remainingAmount of ACTIVE reservations`.
  This catches an orphaned lock or an orphaned reservation.

It is used in the settlement tests. It is not scheduled automatically yet.

## Known limits and open items

These are things the current code does not do. They are listed so nobody
assumes otherwise.

| Area | Current state |
|---|---|
| Kafka partitions | `create-topics.ts` uses the broker default (1 partition in the dev compose file). Everything is correct with more partitions because of the keys, but there is no parallelism today |
| Kafka replication | Single broker, replication factor 1 in dev |
| Gateway rate limits | In memory, per gateway instance. Several instances would each allow the full limit |
| Logout | Access tokens stay valid until they expire (≤ 15 min) |
| Engine shards | Exactly two (`MARKETS_A`, `MARKETS_B`) |
| Engine best price | Linear scan of price levels |
| MARKET buys | Rejected by order-service |
| Withdrawals | `withdrawal.events` topic and enum values exist; no flow is built |
| `EXPIRED` order, `FAILED` deposit | Enum values exist; nothing sets them |
| Reconciliation | Available as a function, not run on a schedule |
| Outbox throughput | One global relay lock means one publisher for the whole system |
| Settlement poison message | An event that always fails blocks its partition; there is no dead-letter topic |
