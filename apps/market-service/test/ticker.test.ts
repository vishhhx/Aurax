import { describe, expect, test } from "bun:test";
import { TickerAggregator, TICKER_WINDOW_MS } from "../src/processors/tickers";
import { TickerStore } from "../src/store/ticker";
import { T0, trade } from "./helpers";

const HOUR = 3_600_000;

function agg() {
  const store = new TickerStore();
  return { store, ticker: new TickerAggregator(store) };
}

describe("TickerAggregator", () => {
  test("computes open/high/low/last/change/volumes exactly", () => {
    const { ticker } = agg();
    const now = T0 + 3 * HOUR;
    ticker.processTrade(trade({ timestamp: T0, price: "100", quantity: "0.1" }), now);
    ticker.processTrade(trade({ timestamp: T0 + HOUR, price: "120.5", quantity: "0.2" }), now);
    const { ticker: t } = ticker.processTrade(trade({ timestamp: T0 + 2 * HOUR, price: "90", quantity: "0.3" }), now);

    expect(t.open24h).toBe("100");
    expect(t.high24h).toBe("120.5");
    expect(t.low24h).toBe("90");
    expect(t.lastPrice).toBe("90");
    expect(t.priceChange24h).toBe("-10");
    expect(t.priceChangePercent24h).toBe("-10");
    expect(t.baseVolume24h).toBe("0.6");
    expect(t.quoteVolume24h).toBe("61.1"); // 10 + 24.1 + 27
    expect(t.tradeCount24h).toBe(3);
  });

  test("duplicates are not double-counted", () => {
    const { ticker } = agg();
    const tr = trade({ quantity: "2" });
    ticker.processTrade(tr, T0);
    const { ticker: t, changed } = ticker.processTrade(tr, T0);
    expect(t.baseVolume24h).toBe("2");
    expect(changed).toBe(false);
  });

  test("out-of-order trades set the correct open and last price", () => {
    const { ticker } = agg();
    const now = T0 + HOUR;
    ticker.processTrade(trade({ timestamp: T0 + 30_000, price: "105" }), now);
    const { ticker: t } = ticker.processTrade(trade({ timestamp: T0, price: "95" }), now);
    expect(t.open24h).toBe("95");
    expect(t.lastPrice).toBe("105");
    expect(t.priceChange24h).toBe("10");
  });

  test("rolling window expires trades and recomputes high/low", () => {
    const { ticker } = agg();
    ticker.processTrade(trade({ timestamp: T0, price: "200" }), T0);
    ticker.processTrade(trade({ timestamp: T0 + HOUR, price: "100" }), T0 + HOUR);

    const [t] = ticker.refresh(T0 + TICKER_WINDOW_MS + 1);
    expect(t!.high24h).toBe("100");
    expect(t!.open24h).toBe("100");
    expect(t!.baseVolume24h).toBe("1");
    expect(t!.tradeCount24h).toBe(1);
  });

  test("empty window keeps last price but resets stats", () => {
    const { ticker } = agg();
    ticker.processTrade(trade({ timestamp: T0, price: "42" }), T0);
    const [t] = ticker.refresh(T0 + 2 * TICKER_WINDOW_MS);
    expect(t!.lastPrice).toBe("42");
    expect(t!.open24h).toBeNull();
    expect(t!.priceChangePercent24h).toBeNull();
    expect(t!.baseVolume24h).toBe("0");
  });

  test("trades older than the window are ignored for volume", () => {
    const { ticker } = agg();
    const { ticker: t } = ticker.processTrade(trade({ timestamp: T0 - TICKER_WINDOW_MS - 1 }), T0);
    expect(t.baseVolume24h).toBe("0");
  });

  test("register creates empty tickers; sequence only increases on change", () => {
    const { ticker, store } = agg();
    ticker.register(["ETHUSDC"], T0);
    const first = store.getTicker("ETHUSDC")!;
    expect(first.lastPrice).toBeNull();
    expect(ticker.refresh(T0 + 1000)).toHaveLength(0);
    expect(store.getTicker("ETHUSDC")!.sequenceNumber).toBe(first.sequenceNumber);
  });
});
