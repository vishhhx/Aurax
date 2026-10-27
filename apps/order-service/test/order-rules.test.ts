import { describe, expect, test } from "bun:test";
import { Prisma } from "@repo/pg";
import { orderSchema } from "../src/schemas/order.schema";
import { reservationFor, validateOrder, type MarketRules } from "../src/services/order-rules";

const D = (v: string) => new Prisma.Decimal(v);
const market: MarketRules = {
  marketId: "m",
  symbol: "BTCUSDC",
  baseAssetId: "btc",
  quoteAssetId: "usdc",
  status: "TRADING",
  isEnabled: true,
  tickSize: D("0.01"),
  stepSize: D("0.000001"),
  minPrice: D("0.01"),
  maxPrice: D("1000000"),
  minQuantity: D("0.000001"),
  maxQuantity: D("1000"),
  minNotional: D("1"),
  makerFee: D("0.001"),
  takerFee: D("0.002"),
  pricePrecision: 2,
  quantityPrecision: 6,
};

const parse = (body: unknown) => orderSchema.parse(body);
const limit = (o: Record<string, unknown> = {}) => parse({ symbol: "BTC-USDC", side: "BUY", orderType: "LIMIT", price: "100.25", quantity: "0.5", ...o });

describe("order schema", () => {
  test("accepts numbers or decimal strings and normalises the symbol", () => {
    expect(limit({ price: 100.25, quantity: 0.5 })).toMatchObject({ symbol: "BTCUSDC", price: "100.25", quantity: "0.5", timeInForce: "GTC" });
  });

  test("MARKET orders need no price (previously impossible) and become IOC", () => {
    const market = parse({ symbol: "BTCUSDC", side: "SELL", orderType: "MARKET", quantity: "1" });
    expect(market.timeInForce).toBe("IOC");
    expect("price" in market).toBe(false);
    expect(() => parse({ symbol: "BTCUSDC", side: "SELL", orderType: "MARKET", quantity: "1", price: "5" })).toThrow();
    expect(() => parse({ symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "1" })).toThrow();
  });

  test("rejects non-positive, exponent and garbage amounts", () => {
    for (const quantity of ["0", "-1", "1e3", "abc", ""]) expect(() => limit({ quantity })).toThrow();
  });
});

describe("market rules", () => {
  test("tick size, step size, ranges and minimum notional", () => {
    expect(() => validateOrder(market, limit())).not.toThrow();
    expect(() => validateOrder(market, limit({ price: "100.255" }))).toThrow(/multiple of 0.01/);
    expect(() => validateOrder(market, limit({ quantity: "0.0000001" }))).toThrow(/multiple of/);
    expect(() => validateOrder(market, limit({ quantity: "5000" }))).toThrow(/between/);
    expect(() => validateOrder(market, limit({ price: "1", quantity: "0.5" }))).toThrow(/at least 1/);
    expect(() => validateOrder({ ...market, status: "HALTED" }, limit())).toThrow(/not available/);
  });

  test("MARKET buys are refused (engine cannot cap their cost); MARKET sells are allowed", () => {
    expect(() => validateOrder(market, parse({ symbol: "BTCUSDC", side: "BUY", orderType: "MARKET", quantity: "1" }))).toThrow(/MARKET buy/);
    expect(() => validateOrder(market, parse({ symbol: "BTCUSDC", side: "SELL", orderType: "MARKET", quantity: "1" }))).not.toThrow();
  });
});

describe("reservation", () => {
  test("BUY locks price × qty plus the higher fee, rounded up to 8 dp; SELL locks the base quantity", () => {
    const buy = reservationFor(market, limit());
    expect([buy.assetId, buy.amount.toFixed()]).toEqual(["usdc", "50.22525"]); // 100.25 × 0.5 = 50.125; × 1.002
    expect(reservationFor(market, limit({ price: "33.33", quantity: "0.000003" })).amount.toFixed()).toBe("0.00010019"); // 0.00009999 × 1.002 = 0.00010018998 → rounded up
    const sell = reservationFor(market, limit({ side: "SELL" }));
    expect([sell.assetId, sell.amount.toFixed()]).toEqual(["btc", "0.5"]);
  });
});
