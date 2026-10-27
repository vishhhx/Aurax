import {
  getGrpcClient,
  Contracts,
  type ReserveBalanceResponse__Output,
  type ReleaseBalanceResponse__Output,
} from "@repo/grpc";

import type * as grpc from "@grpc/grpc-js";

const walletClient = await getGrpcClient(Contracts.Wallet);
const deadline = () => new Date(Date.now() + 5_000);

export class WalletRpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "WalletRpcError";
  }
}

/** Wallet-service gRPC. `asset_symbol` in the proto carries the asset ID. */
class WalletClient {
  /**
   * Locks `amount` of `assetId` for `referenceId`. Resolves only when the
   * wallet confirms `success`; a failed reservation is never treated as one.
   */
  reserveBalance(userId: string, assetId: string, amount: string, referenceId: string): Promise<ReserveBalanceResponse__Output> {
    return new Promise((resolve, reject) => {
      walletClient.reserveBalance(
        { amount, assetSymbol: assetId, referenceId, userId },
        { deadline: deadline() },
        (err: grpc.ServiceError | null, response?: ReserveBalanceResponse__Output) => {
          if (err) return reject(new WalletRpcError(`Wallet service unavailable: ${err.message}`, "UNAVAILABLE"));
          if (!response) return reject(new WalletRpcError("No response from wallet service", "UNAVAILABLE"));
          if (!response.success) {
            return reject(new WalletRpcError("Balance reservation failed", response.errorCode || "RESERVATION_FAILED"));
          }
          resolve(response);
        },
      );
    });
  }

  /** Returns a reservation's remaining funds to the available balance (idempotent). */
  releaseBalance(referenceId: string): Promise<ReleaseBalanceResponse__Output> {
    return new Promise((resolve, reject) => {
      walletClient.releaseBalance(
        { referenceId },
        { deadline: deadline() },
        (err: grpc.ServiceError | null, response?: ReleaseBalanceResponse__Output) => {
          if (err) return reject(new WalletRpcError(`Wallet service unavailable: ${err.message}`, "UNAVAILABLE"));
          if (!response?.success) return reject(new WalletRpcError("Release failed", response?.errorCode || "RELEASE_FAILED"));
          resolve(response);
        },
      );
    });
  }
}

export default new WalletClient();
