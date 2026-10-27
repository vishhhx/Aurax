import type * as grpc from "@grpc/grpc-js";
import type {
  ReleaseBalanceRequest__Output,
  ReleaseBalanceResponse,
  ReserveBalanceRequest__Output,
  ReserveBalanceResponse,
} from "@repo/grpc";

import logger from "../../config/logger";
import reserveRepository, { ReservationError } from "../../repositories/reserve.repository";

export const ReserveBalance = async (
  call: grpc.ServerUnaryCall<ReserveBalanceRequest__Output, ReserveBalanceResponse>,
  callback: grpc.sendUnaryData<ReserveBalanceResponse>,
): Promise<void> => {
  const { assetSymbol, amount, referenceId, userId } = call.request;
  try {
    const reservation = await reserveRepository.reserveBalance({ assetSymbol, amount, referenceId, userId });
    callback(null, { success: true, reservationId: reservation.id, errorCode: "" });
  } catch (error) {
    const code = error instanceof ReservationError ? error.code : "RESERVATION_FAILED";
    if (!(error instanceof ReservationError)) logger.error({ err: error, referenceId }, "Reservation failed");
    callback(null, { success: false, reservationId: "", errorCode: code });
  }
};

export const ReleaseBalance = async (
  call: grpc.ServerUnaryCall<ReleaseBalanceRequest__Output, ReleaseBalanceResponse>,
  callback: grpc.sendUnaryData<ReleaseBalanceResponse>,
): Promise<void> => {
  const { referenceId } = call.request;
  try {
    await reserveRepository.releaseBalance(referenceId);
    callback(null, { success: true, errorCode: "" });
  } catch (error) {
    const code = error instanceof ReservationError ? error.code : "RELEASE_FAILED";
    if (!(error instanceof ReservationError)) logger.error({ err: error, referenceId }, "Release failed");
    callback(null, { success: false, errorCode: code });
  }
};
