export { Contracts } from "./src/client";
export { getGrpcClient } from "./src/client";

export { loadProto } from "./src/util";
export { getGrpcServer } from "./src/server";

export type {
  ReserveBalanceRequest,
  ReserveBalanceRequest__Output,
} from "./generated/wallet/ReserveBalanceRequest";

export type {
  ReserveBalanceResponse,
  ReserveBalanceResponse__Output,
} from "./generated/wallet/ReserveBalanceResponse";

export type {
  ReleaseBalanceRequest,
  ReleaseBalanceRequest__Output,
} from "./generated/wallet/ReleaseBalanceRequest";

export type {
  ReleaseBalanceResponse,
  ReleaseBalanceResponse__Output,
} from "./generated/wallet/ReleaseBalanceResponse";

export type {
  WalletServiceClient,
  WalletServiceDefinition,
} from "./generated/wallet/WalletService";

export type { ProtoGrpcType } from "./generated/wallet";
