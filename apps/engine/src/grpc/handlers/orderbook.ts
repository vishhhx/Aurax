
import * as grpc from "@grpc/grpc-js";

import { engine, EngineMode } from "../../matching-engine/index";

import type {
  GetOrderBookRequest__Output,
  GetOrderBookResponse,
} from "@repo/grpc";

export const GetOrderBook = (
  call: grpc.ServerUnaryCall<
    GetOrderBookRequest__Output,
    GetOrderBookResponse
  >,
  callback: grpc.sendUnaryData<GetOrderBookResponse>,
): void => {
  try {
    const { symbol } = call.request;

    if (!symbol) {
      callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: "Market symbol is required",
      });
      return;
    }

    const mode = engine.getMode();

    if (mode !== EngineMode.LIVE) {
      callback({
        code: grpc.status.UNAVAILABLE,
        message: `Matching engine is not ready: ${mode}`,
      });
      return;
    }

    const orderBook = engine.getOrderBook(symbol);
    const snapshot = orderBook.getSnapshot();

    callback(null, {
      symbol: snapshot.symbol,
      sequenceNumber: engine.getSequenceNumber(symbol).toString(),
      bids: snapshot.bids,
      asks: snapshot.asks,
    });
  } catch (error) {
    const notFound =
      error instanceof Error &&
      error.message.startsWith("Order book not found");

    callback({
      code: notFound
        ? grpc.status.NOT_FOUND
        : grpc.status.INTERNAL,
      message:
        error instanceof Error
          ? error.message
          : "Failed to retrieve order book",
    });
  }
};
