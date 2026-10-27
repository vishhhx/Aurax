import { getGrpcServer, loadProto } from "@repo/grpc";

import type { WalletProtoGrpcType } from "@repo/grpc";

import { ENV } from "../config/env";
import { ReleaseBalance, ReserveBalance } from "./handlers/wallet";

export async function startGrpcServer() {
  const proto = await loadProto<WalletProtoGrpcType>("wallet");

  const grpcServer = await getGrpcServer(ENV.WALLET_GRPC_URL);

  grpcServer.addService(proto.wallet.WalletService.service, {
    ReserveBalance,
    ReleaseBalance,
  });

  return grpcServer;
}
