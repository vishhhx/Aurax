import type { MatchingEngine } from "../matching-engine";
import type { KafkaPosition, Order, OrderSnapshot } from "../orderbook/order";
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

    orderBook.restoreOrders(snapshot.orders.map(fromSnapshot));
    this.engine.restoreSequenceNumber(snapshot.sequenceNumber);

    console.log(
      `[Recovery] Restored ${symbol} from offset ${snapshot.kafka.offset}`,
    );

    return snapshot.kafka;
  }
}
