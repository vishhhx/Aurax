import orderRepositorie from "../../repositories/order.repositorie";
import type { OrderCompletedEvent } from "../order.consumer";

export const handleOrderCompleted = async (event: OrderCompletedEvent) => {
  try {
    await orderRepositorie.updateOrderStatus({
      orderId: event.orderId,
      status: event.status,
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
