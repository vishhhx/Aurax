import type { MatchingEngine } from "../matching-engine";
import type { KafkaPosition, Order, OrderSnapshot } from "../types/order";
import type { OrderBook } from "../orderbook/orderbook";
import { s3Service } from "../utils/s3";

function fromSnapshot(snapshot: OrderSnapshot): Order {
  return {
    id: snapshot.id,
    userId: snapshot.userId,
    symbol: snapshot.symbol,
    side: snapshot.side,
    type: snapshot.type,
    timeInForce: snapshot.timeInForce,
    price: snapshot.price,
    quantity: snapshot.quantity,
    filledQuantity: snapshot.filledQuantity,
    remainingQuantity: snapshot.remainingQuantity,
    executedQuantity: snapshot.executedQuantity,
    postOnly: snapshot.postOnly,
    timestamp: snapshot.timestamp,
    sequenceNumber: snapshot.sequenceNumber,
    fills: snapshot.fills,
  };
}

export class RecoveryManager {
  constructor(private readonly engine: MatchingEngine) {}

  public async recover(
    symbol: string,
    orderBook: OrderBook,
  ): Promise<KafkaPosition | null> {
    const snapshot = await s3Service.getRecentSnapshot(symbol);

    if (!snapshot) {
      return null;
    }

    if (snapshot.symbol !== symbol) {
      throw new Error(
        `Snapshot symbol mismatch: expected ${symbol}, received ${snapshot.symbol}`,
      );
    }

    orderBook.restoreOrders(snapshot.orders.map(fromSnapshot));

    this.engine.restoreSequenceNumber(symbol, snapshot.sequenceNumber);

    this.engine.restoreOrderSequenceNumber(
      symbol,
      snapshot.orderSequenceNumber,
    );

    console.log(
      `[Recovery] Restored ${symbol} from partition ${snapshot.kafka.partition}, offset ${snapshot.kafka.offset}`,
    );

    return snapshot.kafka;
  }
}
