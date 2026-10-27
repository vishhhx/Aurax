
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

    const mode = engine.getEngineStatus();

    if (mode !== EngineMode.LIVE) {
      callback({
        code: grpc.status.UNAVAILABLE,
        message: `Matching engine is not ready: ${mode}`,
      });
      return;
    }

    // Read synchronously (single-threaded): levels and sequence are consistent.
    const book = engine.getFormattedBook(symbol);

    callback(null, {
      symbol,
      sequenceNumber: engine.getSequenceNumber(symbol).toString(),
      bids: book.bids,
      asks: book.asks,
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
