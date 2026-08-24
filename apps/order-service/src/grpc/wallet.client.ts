import * as grpc from "@grpc/grpc-js";
import { loadWalletProto } from "@repo/grpc";

const proto = loadWalletProto() as any;

export const walletClient = new proto.wallet.WalletService(
  process.env.WALLET_GRPC_URL || "localhost:5002",
  grpc.credentials.createInsecure(),
);
