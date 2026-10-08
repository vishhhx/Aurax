import orderClient from "../grpc/orderbook";

export const initializeOrderBooks = async (markets: string[]) => {
  console.log("Initializing market order books...");

  while (true) {
    try {
      const status = await orderClient.getEngineStatus();

      if (!status.isReady) {
        console.log(`Matching engine is not ready. Status: ${status.status}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      console.log("Matching engine is ready.");

      for (const symbol of markets) {
        const orderBook = await orderClient.getOrderBook(symbol);

        console.log(
          `Loaded ${symbol} order book at sequence ${orderBook.sequenceNumber}`,
        );

        // TODO:
        // Store the snapshot in your Market Data order book.
        //
        // marketOrderBooks.set(symbol, {
        //   sequenceNumber: orderBook.sequenceNumber,
        //   bids: orderBook.bids,
        //   asks: orderBook.asks,
        // });
      }

      console.log("All order books initialized.");

      return;
    } catch (error) {
      console.error("Failed to initialize order books. Retrying...", error);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};
