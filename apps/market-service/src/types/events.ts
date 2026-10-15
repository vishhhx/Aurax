export interface MarketTickerEvent {
  event: "market.ticker";
  symbol: string;
  lastPrice: string | null;
  priceChange24h: string | null;
  priceChangePercent24h: string | null;
  high24h: string | null;
  low24h: string | null;
  baseVolume24h: string;
  quoteVolume24h: string;
  timestamp: number;
  sequenceNumber: string;
}

export interface MarketDepthEvent {
  event: "market.depth";
  symbol: string;
  bids: Array<{
    price: string;
    quantity: string;
  }>;
  asks: Array<{
    price: string;
    quantity: string;
  }>;
  timestamp: number;
  sequenceNumber: string;
}

export interface MarketTradeEvent {
  event: "market.trade";
  symbol: string;
  tradeId: string;
  price: string;
  quantity: string;
  timestamp: number;
  side?: "BUY" | "SELL";
}

export interface MarketCandleEvent {
  event: "market.candle";
  symbol: string;
  interval: "1m" | "5m" | "15m" | "1h" | "1d";
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
  isClosed: boolean;
  timestamp: number;
}

export type MarketEvents =
  MarketTickerEvent | MarketDepthEvent | MarketTradeEvent | MarketCandleEvent;
