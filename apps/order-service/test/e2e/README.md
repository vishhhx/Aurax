# End-to-end run (isolated infrastructure)

Runs every real backend service (engine, order, wallet, market, API gateway,
two WebSocket gateways) against throwaway Kafka and Postgres containers.
Never points at the dev database.

Substituted external dependencies: JWTs signed with a test secret (auth-service
is OAuth-only), signed Razorpay `payment.captured` webhooks (no Razorpay API),
filesystem engine snapshots (no S3).

```bash
# 1. Infrastructure
docker run -d --name aurax-e2e-kafka -p 19092:9092 \
  -e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:19092 \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 apache/kafka:latest
docker run -d --name aurax-e2e-pg -p 15432:5432 -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=aurax_e2e postgres:17

# 2. Schema + seed
cd packages/postgres
PG_DATABASE_URL=postgresql://e2e:e2e@localhost:15432/aurax_e2e bunx prisma migrate deploy
PG_DATABASE_URL=postgresql://e2e:e2e@localhost:15432/aurax_e2e bun prisma/seed.ts all

# 3. Services (from this directory)
for s in wallet engine order market api gw1 gw2; do ./svc.sh start $s; sleep 3; done

# 4. Scenarios (from apps/order-service)
source test/e2e/env.sh
E2E_RUN=r1 bun test/e2e/driver.ts main            # A–F, H
PRICE=106 E2E_RUN=r1 bun test/e2e/driver.ts prepare-restart
# restart: test/e2e/svc.sh stop engine|order|gw1 && start them again
PRICE=106 E2E_RUN=r1 RESTING_ORDER=<id> bun test/e2e/driver.ts after-restart   # G
E2E_RUN=r1 bun test/e2e/driver.ts final           # reconciliation & exactly-once

# 5. Teardown
for s in gw1 gw2 api market order engine wallet; do ./svc.sh stop $s; done
docker rm -f aurax-e2e-kafka aurax-e2e-pg
```
