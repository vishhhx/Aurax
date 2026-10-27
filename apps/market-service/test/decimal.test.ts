import { describe, expect, test } from "bun:test";
import {
  DecimalError,
  formatScaled,
  fromDbDecimal,
  mulScaled,
  normalizeDecimal,
  percentChangeScaled,
  toScaled,
} from "../src/lib/decimal";

describe("decimal", () => {
  test("round-trips plain decimals exactly", () => {
    for (const v of ["0", "1", "0.1", "98432.123456789012345678", "123456789012345678.000000000000000001"]) {
      expect(normalizeDecimal(v)).toBe(v);
    }
  });

  test("strips trailing zeros", () => {
    expect(normalizeDecimal("12.3400")).toBe("12.34");
    expect(normalizeDecimal("5.000")).toBe("5");
  });

  test("accepts scientific notation produced by the engine's Number#toString", () => {
    expect(normalizeDecimal("1e-7")).toBe("0.0000001");
    expect(normalizeDecimal("1.5e+3")).toBe("1500");
    expect(normalizeDecimal(String(0.1 + 0.2))).toBe("0.30000000000000004");
  });

  test("rejects negatives, garbage and >18 fractional digits", () => {
    for (const v of ["-1", "abc", "1.2.3", "", "1e-19", "0.0000000000000000001", "NaN", "Infinity"]) {
      expect(() => toScaled(v)).toThrow(DecimalError);
    }
  });

  test("multiplication is exact to 18 places (no float error)", () => {
    expect(formatScaled(mulScaled(toScaled("0.1"), toScaled("0.2")))).toBe("0.02");
    expect(formatScaled(mulScaled(toScaled("98432.1"), toScaled("1.5")))).toBe("147648.15");
  });

  test("percent change handles zero base", () => {
    expect(percentChangeScaled(0n, toScaled("1"))).toBeNull();
    expect(formatScaled(percentChangeScaled(toScaled("100"), toScaled("110"))!)).toBe("10");
    expect(formatScaled(percentChangeScaled(toScaled("100"), toScaled("90"))!)).toBe("-10");
  });

  test("fromDbDecimal never emits exponent notation", () => {
    expect(fromDbDecimal({ toFixed: () => "0.000000100000000000" })).toBe("0.0000001");
  });
});
