export ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
export LOGS=${E2E_LOGS:-/tmp/aurax-e2e}
export KAFKA_BROKERS=localhost:19092
export PG_DATABASE_URL=postgresql://e2e:e2e@localhost:15432/aurax_e2e
export JWT_ACCESS_SECRET=e2e-secret
export NODE_ENV=production
export KAFKAJS_NO_PARTITIONER_WARNING=1
mkdir -p "$LOGS"
