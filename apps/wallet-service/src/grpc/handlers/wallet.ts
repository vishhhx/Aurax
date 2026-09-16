import type * as grpc from "@grpc/grpc-js";

import type {
  ReserveBalanceRequest__Output,
  ReserveBalanceResponse,
} from "@repo/grpc";

export const ReserveBalance = async (
  call: grpc.ServerUnaryCall<
    ReserveBalanceRequest__Output,
    ReserveBalanceResponse
  >,
  callback: grpc.sendUnaryData<ReserveBalanceResponse>,
): Promise<void> => {
  const { assetSymbol, amount, referenceId, userId } = call.request;

  console.log({ assetSymbol, amount, referenceId, userId });

  callback(null, {
    success: true,
    reservationId: "reservation-123",
    errorCode: "",
  });
};
