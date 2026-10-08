import type * as grpc from "@grpc/grpc-js";
import { engine } from "../../matching-engine/index";

import type {
  GetEngineStatusRequest__Output,
  GetEngineStatusResponse,
} from "@repo/grpc";

export const GetEngineStatus = async (
  _call: grpc.ServerUnaryCall<
    GetEngineStatusRequest__Output,
    GetEngineStatusResponse
  >,
  callback: grpc.sendUnaryData<GetEngineStatusResponse>,
): Promise<void> => {
  try {
    const mode = engine.getMode();
    const isReady = mode === "LIVE";

    callback(null, {
      isReady,
      status: mode,
      errorCode: isReady ? "" : "ENGINE_NOT_READY",
    });
  } catch (error) {
    callback({
      code: 13,
      message:
        error instanceof Error
          ? error.message
          : "Failed to get matching engine status",
    });
  }
};
