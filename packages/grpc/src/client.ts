import * as grpc from "@grpc/grpc-js";

import { loadProto } from "./util";

import type { ProtoGrpcType as WalletProtoGrpcType } from "../generated/wallet";
import type { WalletServiceClient } from "../generated/wallet/WalletService";

import type { ProtoGrpcType as OrderProtoGrpcType } from "../generated/order";
import type { MatchingEngineClient } from "../generated/order/MatchingEngine";

export enum Contracts {
  Wallet = "wallet",
  Order = "order",
}

const CONTRACT_URLS: Record<Contracts, string> = {
  [Contracts.Wallet]: process.env.WALLET_GRPC_URL || "localhost:5002",
  [Contracts.Order]: process.env.ORDER_GRPC_URL || "localhost:5003",
};

type ContractClients = {
  [Contracts.Wallet]: WalletServiceClient;
  [Contracts.Order]: MatchingEngineClient;
};

const CONTRACT_CLIENTS: {
  [K in Contracts]: (address: string) => Promise<ContractClients[K]>;
} = {
  [Contracts.Wallet]: async (address: string): Promise<WalletServiceClient> => {
    const proto = await loadProto<WalletProtoGrpcType>(Contracts.Wallet);

    return new proto.wallet.WalletService(
      address,
      grpc.credentials.createInsecure(),
    );
  },

  [Contracts.Order]: async (address: string): Promise<MatchingEngineClient> => {
    const proto = await loadProto<OrderProtoGrpcType>(Contracts.Order);

    return new proto.order.MatchingEngine(
      address,
      grpc.credentials.createInsecure(),
    );
  },
};

export const getGrpcClient = async <T extends Contracts>(
  contract: T,
): Promise<ContractClients[T]> => {
  const address = CONTRACT_URLS[contract];

  const createClient = CONTRACT_CLIENTS[contract];

  return createClient(address) as Promise<ContractClients[T]>;
};
