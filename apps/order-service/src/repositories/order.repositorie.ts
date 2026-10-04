import {
  prisma,
  OrderType,
  OrderSide,
  OrderStatus,
  ReservationStatus,
  Prisma,
  LedgerEntryType,
  LedgerReferenceType,
  WalletTransactionType,
  WalletTransactionStatus,
} from "@repo/pg";
import type { TradeExecutedEvent } from "../consumers/order.consumer";

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

class OrderRepository {
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

  async updateOrderStatus({
    orderId,
    status,
  }: {
    orderId: string;
    status: OrderStatus;
  }) {
    return prisma.order.update({
      where: {
        orderId,
      },
      data: {
        status,
      },
    });
  }
  async closeOrderAndReleaseReservation({
    userId,
    orderId,
    symbol,
    status,
  }: {
    userId: string;
    orderId: string;
    symbol: string;
    status: "CANCELLED" | "REJECTED";
  }) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findFirst({
        where: {
          orderId,
          userId,
          symbol,
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.OPEN,
              OrderStatus.PARTIALLY_FILLED,
            ],
          },
        },
        select: {
          orderId: true,
          referenceId: true,
          status: true,
        },
      });

      if (!order) {
        throw new Error("Order cannot be closed");
      }

      await tx.order.update({
        where: {
          orderId: order.orderId,
        },
        data: {
          status,
        },
      });

      const reservation = await tx.balanceReservation.findUnique({
        where: {
          referenceId: order.referenceId,
        },
        select: {
          assetId: true,
          remainingAmount: true,
          status: true,
        },
      });

      if (!reservation) {
        throw new Error("Balance reservation not found");
      }

      await tx.balanceReservation.update({
        where: {
          referenceId: order.referenceId,
        },
        data: {
          status: ReservationStatus.CANCELLED,
          remainingAmount: 0,
        },
      });

      if (reservation.remainingAmount.gt(0)) {
        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId,
              assetId: reservation.assetId,
            },
          },
          data: {
            lockedBalance: {
              decrement: reservation.remainingAmount,
            },
            availableBalance: {
              increment: reservation.remainingAmount,
            },
          },
        });
      }

      return {
        orderId: order.orderId,
        status,
        releasedAmount: reservation.remainingAmount.toString(),
        assetId: reservation.assetId,
      };
    });
  }

  async executeTrade(trade: TradeExecutedEvent) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const market = await tx.market.findUnique({
        where: {
          marketId: trade.marketId,
        },
        select: {
          baseAssetId: true,
          quoteAssetId: true,
          makerFee: true,
          takerFee: true,
        },
      });

      if (!market) {
        throw new Error(`Market not found: ${trade.marketId}`);
      }
      const quantity = new Prisma.Decimal(trade.quantity);
      const price = new Prisma.Decimal(trade.price);
      const quoteAmount = price.mul(quantity);
      const makerFee = quoteAmount.mul(new Prisma.Decimal(market.makerFee));
      const takerFee = quoteAmount.mul(new Prisma.Decimal(market.takerFee));

      const makerBefore = await tx.order.findUnique({
        where: {
          orderId: trade.maker.orderId,
        },
      });

      if (!makerBefore) {
        throw new Error(`Maker order not found: ${trade.maker.orderId}`);
      }

      const takerBefore = await tx.order.findUnique({
        where: {
          orderId: trade.taker.orderId,
        },
      });

      if (!takerBefore) {
        throw new Error(`Taker order not found: ${trade.taker.orderId}`);
      }
      if (quantity.lte(0) || price.lte(0)) {
        throw new Error(`Invalid trade quantity or price`);
      }

      if (quantity.gt(makerBefore.remainingQuantity)) {
        throw new Error(`Trade quantity exceeds maker remaining quantity`);
      }

      if (quantity.gt(takerBefore.remainingQuantity)) {
        throw new Error(`Trade quantity exceeds taker remaining quantity`);
      }
      const makerPreviousExecuted = makerBefore.executedQuantity;
      const takerPreviousExecuted = takerBefore.executedQuantity;
      const makerPreviousAverage =
        makerBefore.averagePrice ?? new Prisma.Decimal(0);
      const takerPreviousAverage =
        takerBefore.averagePrice ?? new Prisma.Decimal(0);

      const makerTotalValue = makerPreviousAverage
        .mul(makerPreviousExecuted)
        .add(quoteAmount);

      const takerTotalValue = takerPreviousAverage
        .mul(takerPreviousExecuted)
        .add(quoteAmount);

      const makerNewExecuted = makerPreviousExecuted.add(quantity);

      const takerNewExecuted = takerPreviousExecuted.add(quantity);

      const makerAveragePrice = makerTotalValue.div(makerNewExecuted);

      const takerAveragePrice = takerTotalValue.div(takerNewExecuted);

      const makerOrder = await tx.order.update({
        where: {
          orderId: trade.maker.orderId,
        },

        data: {
          remainingQuantity: {
            decrement: quantity,
          },

          executedQuantity: {
            increment: quantity,
          },

          averagePrice: makerAveragePrice,

          status:
            trade.maker.status === "FILLED"
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      });

      const takerOrder = await tx.order.update({
        where: {
          orderId: trade.taker.orderId,
        },

        data: {
          remainingQuantity: {
            decrement: quantity,
          },

          executedQuantity: {
            increment: quantity,
          },

          averagePrice: takerAveragePrice,

          status:
            trade.taker.status === "FILLED"
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED,
        },
      });

      const makerReservation = await tx.balanceReservation.findUnique({
        where: {
          referenceId: makerBefore.referenceId,
        },
      });

      if (!makerReservation) {
        throw new Error(
          `Maker reservation not found for referenceId ${makerBefore.referenceId}`,
        );
      }

      const takerReservation = await tx.balanceReservation.findUnique({
        where: {
          referenceId: takerBefore.referenceId,
        },
      });

      if (!takerReservation) {
        throw new Error(
          `Taker reservation not found for referenceId ${takerBefore.referenceId}`,
        );
      }

      const makerReservationUsed =
        trade.maker.side === OrderSide.BUY
          ? quoteAmount.add(makerFee)
          : quantity;

      const takerReservationUsed =
        trade.taker.side === OrderSide.BUY
          ? quoteAmount.add(takerFee)
          : quantity;

      if (makerReservation.remainingAmount.lt(makerReservationUsed)) {
        throw new Error(`Insufficient maker reservation`);
      }

      if (takerReservation.remainingAmount.lt(takerReservationUsed)) {
        throw new Error(`Insufficient taker reservation`);
      }

      const makerRemaining =
        makerReservation.remainingAmount.sub(makerReservationUsed);

      const takerRemaining =
        takerReservation.remainingAmount.sub(takerReservationUsed);

      await tx.balanceReservation.update({
        where: {
          id: makerReservation.id,
        },

        data: {
          remainingAmount: makerRemaining,

          status: makerRemaining.eq(0)
            ? ReservationStatus.CONSUMED
            : ReservationStatus.ACTIVE,
        },
      });

      await tx.balanceReservation.update({
        where: {
          id: takerReservation.id,
        },

        data: {
          remainingAmount: takerRemaining,

          status: takerRemaining.eq(0)
            ? ReservationStatus.CONSUMED
            : ReservationStatus.ACTIVE,
        },
      });

      await tx.trade.create({
        data: {
          tradeId: `${trade.tradeId}-maker`,
          executionId: trade.tradeId,

          orderId: makerOrder.orderId,
          userId: trade.maker.userId,

          marketId: trade.marketId,
          symbol: trade.symbol,

          side: trade.maker.side,

          price,
          quantity,

          quoteAmount,

          fee: makerFee,

          feeAsset: market.quoteAssetId,
        },
      });

      await tx.trade.create({
        data: {
          tradeId: `${trade.tradeId}-taker`,
          executionId: trade.tradeId,

          orderId: takerOrder.orderId,
          userId: trade.taker.userId,

          marketId: trade.marketId,
          symbol: trade.symbol,

          side: trade.taker.side,

          price,
          quantity,

          quoteAmount,

          fee: takerFee,

          feeAsset: market.quoteAssetId,
        },
      });
      //...................

      if (trade.maker.side === OrderSide.BUY) {
        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.maker.userId,
              assetId: market.quoteAssetId,
            },
          },

          data: {
            lockedBalance: {
              decrement: makerReservationUsed,
            },
          },
        });

        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.maker.userId,
              assetId: market.baseAssetId,
            },
          },

          data: {
            availableBalance: {
              increment: quantity,
            },
          },
        });
      } else {
        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.maker.userId,
              assetId: market.baseAssetId,
            },
          },

          data: {
            lockedBalance: {
              decrement: quantity,
            },
          },
        });

        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.maker.userId,
              assetId: market.quoteAssetId,
            },
          },

          data: {
            availableBalance: {
              increment: quoteAmount.sub(makerFee),
            },
          },
        });
      }

      if (trade.taker.side === OrderSide.BUY) {
        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.taker.userId,
              assetId: market.quoteAssetId,
            },
          },

          data: {
            lockedBalance: {
              decrement: takerReservationUsed,
            },
          },
        });

        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.taker.userId,
              assetId: market.baseAssetId,
            },
          },

          data: {
            availableBalance: {
              increment: quantity,
            },
          },
        });
      } else {
        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.taker.userId,
              assetId: market.baseAssetId,
            },
          },

          data: {
            lockedBalance: {
              decrement: quantity,
            },
          },
        });

        await tx.wallet.update({
          where: {
            userId_assetId: {
              userId: trade.taker.userId,
              assetId: market.quoteAssetId,
            },
          },

          data: {
            availableBalance: {
              increment: quoteAmount.sub(takerFee),
            },
          },
        });
      }

      if (trade.maker.side === OrderSide.BUY) {
        await tx.ledger.createMany({
          data: [
            {
              userId: trade.maker.userId,
              assetId: market.baseAssetId,

              entryType: LedgerEntryType.CREDIT,
              amount: quantity,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },

            {
              userId: trade.maker.userId,
              assetId: market.quoteAssetId,

              entryType: LedgerEntryType.DEBIT,
              amount: quoteAmount,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },
          ],
        });
      } else {
        await tx.ledger.createMany({
          data: [
            {
              userId: trade.maker.userId,
              assetId: market.baseAssetId,

              entryType: LedgerEntryType.DEBIT,
              amount: quantity,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },

            {
              userId: trade.maker.userId,
              assetId: market.quoteAssetId,

              entryType: LedgerEntryType.CREDIT,
              amount: quoteAmount,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },
          ],
        });
      }

      if (trade.taker.side === OrderSide.BUY) {
        await tx.ledger.createMany({
          data: [
            {
              userId: trade.taker.userId,
              assetId: market.baseAssetId,

              entryType: LedgerEntryType.CREDIT,
              amount: quantity,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },

            {
              userId: trade.taker.userId,
              assetId: market.quoteAssetId,

              entryType: LedgerEntryType.DEBIT,
              amount: quoteAmount,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },
          ],
        });
      } else {
        await tx.ledger.createMany({
          data: [
            {
              userId: trade.taker.userId,
              assetId: market.baseAssetId,

              entryType: LedgerEntryType.DEBIT,
              amount: quantity,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },

            {
              userId: trade.taker.userId,
              assetId: market.quoteAssetId,

              entryType: LedgerEntryType.CREDIT,
              amount: quoteAmount,

              referenceId: trade.tradeId,
              referenceType: LedgerReferenceType.TRADE,
            },
          ],
        });
      }

      if (makerFee.gt(0)) {
        await tx.ledger.create({
          data: {
            userId: trade.maker.userId,
            assetId: market.quoteAssetId,

            entryType: LedgerEntryType.DEBIT,
            amount: makerFee,

            referenceId: trade.tradeId,
            referenceType: LedgerReferenceType.FEE,
          },
        });
      }

      if (takerFee.gt(0)) {
        await tx.ledger.create({
          data: {
            userId: trade.taker.userId,
            assetId: market.quoteAssetId,

            entryType: LedgerEntryType.DEBIT,
            amount: takerFee,

            referenceId: trade.tradeId,
            referenceType: LedgerReferenceType.FEE,
          },
        });
      }

      await tx.walletTransaction.createMany({
        data: [
          {
            userId: trade.maker.userId,

            assetId:
              trade.maker.side === OrderSide.BUY
                ? market.baseAssetId
                : market.quoteAssetId,

            amount:
              trade.maker.side === OrderSide.BUY
                ? quantity
                : quoteAmount.sub(makerFee),

            type: WalletTransactionType.TRADE,

            status: WalletTransactionStatus.SUCCESS,

            referenceId: trade.tradeId,
          },

          {
            userId: trade.taker.userId,

            assetId:
              trade.taker.side === OrderSide.BUY
                ? market.baseAssetId
                : market.quoteAssetId,

            amount:
              trade.taker.side === OrderSide.BUY
                ? quantity
                : quoteAmount.sub(takerFee),

            type: WalletTransactionType.TRADE,

            status: WalletTransactionStatus.SUCCESS,

            referenceId: trade.tradeId,
          },
        ],
      });

      return {
        tradeId: trade.tradeId,

        makerOrderId: makerOrder.orderId,
        takerOrderId: takerOrder.orderId,

        makerStatus: makerOrder.status,
        takerStatus: takerOrder.status,

        quantity: quantity.toString(),
        price: price.toString(),
        quoteAmount: quoteAmount.toString(),

        makerFee: makerFee.toString(),
        takerFee: takerFee.toString(),
      };
    });
  }
}

export default new OrderRepository();
