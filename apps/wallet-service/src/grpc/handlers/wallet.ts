import type * as grpc from "@grpc/grpc-js";
import reserveRepository from "../../repositories/reserve.repository";
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
console.log("ReserveBalance request received:",call.request);
  try {
    const reservation = await reserveRepository.reserveBalance({
      assetSymbol,
      amount,
      referenceId,
      userId,
    });
    console.log("Reservation created:", reservation);

    callback(null, {
      success: true,
      reservationId: reservation.id,
      errorCode: "",
    });
  } catch (error) {
    console.error("Error reserving balance:", error);
    callback(null, {
      success: false,
      reservationId: "",
      errorCode: "RESERVATION_FAILED",
    });
  }
};
