import OrderClient from "../grpc/orderbook";
import { marketsStore } from "../store/markets";
import { reconstructTickerStates } from "./ticker-initialize";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const initializeOrderBooks = async (
  markets: string[],
): Promise<void> => {
  // 1. Wait until the Matching Engine is ready.
  while (true) {
    try {
      const status = await OrderClient.getEngineStatus();

      if (status.isReady) {
        break;
      }

      console.log(`Matching engine is not ready. Status: ${status.status}`);
    } catch (error) {
      console.error("Failed to check matching engine status:", error);
    }

    await sleep(2000);
  }

  // 2. Restore order books from the Matching Engine.
  for (const symbol of markets) {
    const snapshot = await OrderClient.getOrderBook(symbol);

    marketsStore.initialize({
      symbol: snapshot.symbol,
      sequenceNumber: Number(snapshot.sequenceNumber),
      bids: snapshot.bids.map((level) => ({
        price: Number(level.price),
        quantity: Number(level.quantity),
      })),
      asks: snapshot.asks.map((level) => ({
        price: Number(level.price),
        quantity: Number(level.quantity),
      })),
    });

    console.log(
      `Loaded ${symbol} order book at sequence ${snapshot.sequenceNumber}`,
    );
  }

  // 3. Reconstruct ticker states from persisted trades.
  await reconstructTickerStates(markets);

  console.log("Market order books and ticker states initialized");
};
