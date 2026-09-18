import { prisma, OrderType, OrderSide } from "@repo/pg";

interface CreateOrderParams {
  orderType: OrderType;
  side: OrderSide;
  price?: number;
  quantity: number;
  symbol: string;
  userId: string;
  referenceId: string;
  marketId: string;
}

export class OrderRepository {
  async createOrder({
    orderType,
    side,
    price,
    quantity,
    symbol,
    userId,
    referenceId,
    marketId,
  }: CreateOrderParams) {
    return prisma.order.create({
      data: {
        orderType,
        side,
        price,
        quantity,
        remainingQuantity: quantity,
        symbol,
        userId,
        referenceId,
        market: {
          connect: {
            marketId,
          },
        },
      },
    });
  }
}

export default new OrderRepository();