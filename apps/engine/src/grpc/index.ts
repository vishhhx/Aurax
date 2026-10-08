import { getGrpcServer, loadProto } from "@repo/grpc";

import type { OrderProtoGrpcType } from "@repo/grpc";

import { GetEngineStatus } from "./handlers/engine-status";
import { GetOrderBook } from "./handlers/orderbook";

export async function startGrpcServer() {
  const proto = await loadProto<OrderProtoGrpcType>("order");

  const grpcServer = await getGrpcServer();

  grpcServer.addService(proto.order.MatchingEngine.service, {
    GetEngineStatus,
    GetOrderBook,
  });
}
