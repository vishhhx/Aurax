import { getGrpcServer, loadProto } from "@repo/grpc";

import type { OrderProtoGrpcType } from "@repo/grpc";

import { GetEngineStatus } from "./handlers/engine-status";
import { GetOrderBook } from "./handlers/orderbook";

/** Serves this worker's books (GetOrderBook / GetEngineStatus) on `address`. */
export async function startGrpcServer(address: string) {
  const proto = await loadProto<OrderProtoGrpcType>("order");

  const grpcServer = await getGrpcServer(address);

  grpcServer.addService(proto.order.MatchingEngine.service, {
    GetEngineStatus,
    GetOrderBook,
  });

  return grpcServer;
}
