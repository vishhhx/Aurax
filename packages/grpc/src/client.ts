import * as grpc from "@grpc/grpc-js";

import { loadProto } from "./util";

import type { ProtoGrpcType as WalletProtoGrpcType } from "../generated/wallet";
import type { WalletServiceClient } from "../generated/wallet/WalletService";

export enum Contracts {
  Wallet = "wallet",
}

const CONTRACT_URLS: Record<Contracts, string> = {
  [Contracts.Wallet]: process.env.WALLET_GRPC_URL || "localhost:5002",
};

type ContractClients = {
  [Contracts.Wallet]: WalletServiceClient;
};

const CONTRACT_CLIENTS = {
  [Contracts.Wallet]: async (address: string): Promise<WalletServiceClient> => {
    const proto = await loadProto<WalletProtoGrpcType>(Contracts.Wallet);

    return new proto.wallet.WalletService(
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
