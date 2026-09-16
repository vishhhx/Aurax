import { getGrpcServer, loadProto } from "@repo/grpc";

import type { ProtoGrpcType as WalletProtoGrpcType } from "@repo/grpc";

import { ReserveBalance } from "./handlers/wallet";

const proto = await loadProto<WalletProtoGrpcType>("wallet");

const grpcServer = getGrpcServer();

grpcServer.addService(proto.wallet.WalletService.service, {
  ReserveBalance,
});
