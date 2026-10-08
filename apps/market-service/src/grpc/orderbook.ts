import {
  getGrpcClient,
  Contracts,
  type GetEngineStatusResponse__Output,
  type GetOrderBookResponse__Output,
} from "@repo/grpc";

import * as grpc from "@grpc/grpc-js";
import { ApiError } from "@repo/core/rest";

const orderClient = await getGrpcClient(Contracts.Order);

class OrderClient {
  async getEngineStatus(): Promise<GetEngineStatusResponse__Output> {
    return new Promise((resolve, reject) => {
      orderClient.getEngineStatus(
        {},
        (
          err: grpc.ServiceError | null,
          response?: GetEngineStatusResponse__Output,
        ) => {
          if (err) {
            reject(
              new ApiError(500, "Failed to get matching engine status", [
                err.message,
              ]),
            );
            return;
          }

          if (!response) {
            reject(
              new ApiError(500, "Failed to get matching engine status", [
                "No response received from matching engine",
              ]),
            );
            return;
          }

          resolve(response);
        },
      );
    });
  }

  async getOrderBook(symbol: string): Promise<GetOrderBookResponse__Output> {
    return new Promise((resolve, reject) => {
      orderClient.getOrderBook(
        {
          symbol,
        },
        (
          err: grpc.ServiceError | null,
          response?: GetOrderBookResponse__Output,
        ) => {
          if (err) {
            reject(
              new ApiError(500, "Failed to get order book", [err.message]),
            );
            return;
          }

          if (!response) {
            reject(
              new ApiError(500, "Failed to get order book", [
                "No response received from matching engine",
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

export default new OrderClient();
