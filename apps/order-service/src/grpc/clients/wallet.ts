import { getGrpcClient, Contracts } from "@repo/grpc";

const walletClient = await getGrpcClient(Contracts.Wallet);
