#!/usr/bin/env bash
# usage: svc.sh start|stop NAME
source "$(dirname "$0")/env.sh"
start() {
  local name=$1 dir=$2; shift 2
  ( cd "$ROOT/$dir" && exec env "$@" bun src/${ENTRY:-server.ts} ) >> "$LOGS/$name.log" 2>&1 &
  echo $! > "$LOGS/$name.pid"
}
case "$1:$2" in
  start:wallet)  start wallet wallet-service PORT=15002 WALLET_GRPC_URL=127.0.0.1:18002 RAZORPAY_WEBHOOK_SECRET=e2e-whsec ;;
  start:order)   start order order-service PORT=15003 WALLET_GRPC_URL=127.0.0.1:18002 ;;
  start:engine)  ENTRY=index.ts start engine engine MARKETS_A=BTCUSDC,ETHUSDC MARKETS_B=SOLUSDC,USDTUSDC ENGINE_GRPC_HOST=127.0.0.1 ENGINE_GRPC_BASE_PORT=18003 SNAPSHOT_STORE=fs SNAPSHOT_DIR=$LOGS/snapshots SNAPSHOT_EVERY=3 ;;
  start:market)  start market market-service PORT=15004 "ORDER_GRPC_URL=BTCUSDC,ETHUSDC=127.0.0.1:18003;SOLUSDC,USDTUSDC=127.0.0.1:18004" MARKETS=BTCUSDC,ETHUSDC,SOLUSDC,USDTUSDC DEPTH_SNAPSHOT_INTERVAL_MS=600000 KAFKA_GROUP_PREFIX=market-service ;;
  start:gw1)     start gw1 websockets PORT=15005 INSTANCE_ID=gw1 MARKET_SERVICE_URL=http://127.0.0.1:15004 ;;
  start:gw2)     start gw2 websockets PORT=15006 INSTANCE_ID=gw2 MARKET_SERVICE_URL=http://127.0.0.1:15004 ;;
  start:api)     start api api-gateway PORT=15000 AUTH_SERVICE_URL=http://127.0.0.1:15001 WALLET_SERVICE_URL=http://127.0.0.1:15002 ORDER_SERVICE_URL=http://127.0.0.1:15003 MARKET_SERVICE_URL=http://127.0.0.1:15004 ;;
  stop:*)        [ -f "$LOGS/$2.pid" ] && kill -TERM "$(cat "$LOGS/$2.pid")" 2>/dev/null; for i in $(seq 1 40); do kill -0 "$(cat "$LOGS/$2.pid")" 2>/dev/null || break; sleep 0.25; done ;;
esac
