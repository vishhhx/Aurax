import { describe, expect, test } from "bun:test";
import { listDepositsSchema, listLedgerSchema } from "../src/controller/history.controller";

describe("history query validation", () => {
  test("defaults and coercion", () => {
    expect(listDepositsSchema.parse({})).toEqual({ limit: 50 });
    expect(listLedgerSchema.parse({ limit: "10", referenceType: "TRADE", before: "abc" })).toEqual({
      limit: 10,
      referenceType: "TRADE",
      before: "abc",
    });
  });

  test("rejects out-of-range limits and unknown enums", () => {
    expect(listDepositsSchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listDepositsSchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(listDepositsSchema.safeParse({ status: "DONE" }).success).toBe(false);
    expect(listLedgerSchema.safeParse({ referenceType: "BONUS" }).success).toBe(false);
  });
});

describe("deposit quote", async () => {
  process.env.USDC_INR_RATE ??= "95.72";
  const { quoteInrDeposit } = await import("../src/controller/deposit.controller");
  const { ENV } = await import("../src/config/env");

  test("credit is INR / rate rounded DOWN to 8 dp (never over-credits)", () => {
    const { usdcAmount } = quoteInrDeposit("500");
    const rate = ENV.USDC_INR_RATE;
    expect(usdcAmount.mul(rate).lte(500)).toBe(true); // never worth more than paid
    expect(usdcAmount.add("0.00000001").mul(rate).gt(500)).toBe(true); // and the largest such amount
    expect(usdcAmount.decimalPlaces()).toBeLessThanOrEqual(8);
    expect(quoteInrDeposit(500).usdcAmount.toFixed()).toBe(usdcAmount.toFixed());
  });

  test("rejects bad amounts with the same rules as init-deposit", () => {
    for (const bad of ["99.99", "500000.01", "1.234", "-5", "abc", undefined]) {
      expect(() => quoteInrDeposit(bad)).toThrow();
    }
  });
});
