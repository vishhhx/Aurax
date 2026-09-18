import {
  getGrpcClient,
  Contracts,
  type ReserveBalanceResponse__Output,
} from "@repo/grpc";

import * as grpc from "@grpc/grpc-js";
import { ApiError } from "@repo/core/rest";

const walletClient = await getGrpcClient(Contracts.Wallet);

class WalletClient {
  async reserveBalance(
    userId: string,
    assetSymbol: string,
    amount: string,
    referenceId: string,
  ): Promise<ReserveBalanceResponse__Output> {
    return new Promise((resolve, reject) => {
      console.log("Calling reserveBalance with:", {
        userId,
        assetSymbol,
        amount,
        referenceId,
      });
      walletClient.reserveBalance(
        {
          amount,
          assetSymbol,
          referenceId,
          userId,
        },
        (
          err: grpc.ServiceError | null,
          response?: ReserveBalanceResponse__Output,
        ) => {
          if (err) {
            reject(
              new ApiError(500, "Failed to reserve balance", [err.message]),
            );
            return;
          }

          if (!response) {
            reject(
              new ApiError(500, "Failed to reserve balance", [
                "No response received from wallet service",
              ]),
            );
            return;
          }

          resolve(response);
        },
      );
    });
  }
}

export default new WalletClient();
