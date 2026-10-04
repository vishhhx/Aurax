import orderRepositorie from "../../repositories/order.repositorie";
import type {
  OrderCancelledEvent,
  OrderCompletedEvent,
  OrderRejectedEvent,
} from "../order.consumer";

export const handleOrderCancelled = async (event: OrderCancelledEvent) => {
  try {
    await orderRepositorie.closeOrderAndReleaseReservation({
      userId: event.userId,
      orderId: event.orderId,
      symbol: event.symbol,
      status: "CANCELLED",
    });
  } catch (error) {
    console.error(
      `Failed to update order status for orderId: ${event.orderId}`,
      error,
    );

    throw new Error(
      `Failed to update order status for orderId: ${event.orderId}`,
      {
        cause: error,
      },
    );
  }
};

export const handleRejectedOrder = async (event: OrderRejectedEvent) => {
  try {
    await orderRepositorie.closeOrderAndReleaseReservation({
      userId: event.userId,
      orderId: event.orderId,
      symbol: event.symbol,
      status: "REJECTED",
    });
  } catch (error) {
    console.error(
      `Failed to update order status for orderId: ${event.orderId}`,
      error,
    );

    throw new Error(
      `Failed to update order status for orderId: ${event.orderId}`,
      {
        cause: error,
      },
    );
  }
};
