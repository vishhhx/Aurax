import { describe, expect, test } from "bun:test"
import * as D from "@/lib/decimal"

describe("decimal arithmetic", () => {
  test("add/sub/mul are exact where floats are not", () => {
    expect(D.add("0.1", "0.2")).toBe("0.3")
    expect(D.sub("1", "0.9")).toBe("0.1")
    expect(D.mul("0.07", "100")).toBe("7")
    expect(D.mul("65000", "0.001")).toBe("65")
    expect(D.add("-1.5", "1.5")).toBe("0")
  })

  test("large values keep every digit", () => {
    expect(D.add("123456789012345678.12345678", "0.00000001")).toBe("123456789012345678.12345679")
  })

  test("div rounds to scale in the requested direction", () => {
    expect(D.div("1", "3", 4)).toBe("0.3333")
    expect(D.div("2", "3", 4, "half-up")).toBe("0.6667")
    expect(D.div("1", "3", 2, "up")).toBe("0.34")
    expect(D.div("10", "4", 0)).toBe("2")
    expect(() => D.div("1", "0", 2)).toThrow()
  })

  test("comparisons", () => {
    expect(D.cmp("1.10", "1.1")).toBe(0)
    expect(D.lt("0.0001", "0.001")).toBe(true)
    expect(D.gt("-1", "-2")).toBe(true)
    expect(D.max("2", "10")).toBe("10")
    expect(D.isZero("0.000")).toBe(true)
  })

  test("isMultipleOf checks tick and step sizes exactly", () => {
    expect(D.isMultipleOf("65000.01", "0.01")).toBe(true)
    expect(D.isMultipleOf("65000.015", "0.01")).toBe(false)
    expect(D.isMultipleOf("0.00003", "0.00001")).toBe(true)
    expect(D.isMultipleOf("1", "0")).toBe(false)
  })

  test("rounding modes", () => {
    expect(D.round("1.005", 2, "half-up")).toBe("1.01")
    expect(D.round("1.009", 2, "down")).toBe("1")
    expect(D.round("65.12999999", 2, "up")).toBe("65.13")
    expect(D.round("-1.25", 1, "half-up")).toBe("-1.3")
    expect(D.toFixed("1.5", 3)).toBe("1.500")
    expect(D.toFixed("0", 2)).toBe("0.00")
  })

  test("floorToStep", () => {
    expect(D.floorToStep("0.123456", "0.0001")).toBe("0.1234")
    expect(D.floorToStep("5", "2")).toBe("4")
  })

  test("input helpers", () => {
    expect(D.isDecimalInput("")).toBe(true)
    expect(D.isDecimalInput("1.")).toBe(true)
    expect(D.isDecimalInput("1.2.3")).toBe(false)
    expect(D.isDecimalInput("1e5")).toBe(false)
    expect(D.normalizeInput(".5")).toBe("0.5")
    expect(D.normalizeInput("2.")).toBe("2")
    expect(D.normalizeInput(".")).toBeNull()
    expect(D.normalize("001.500")).toBe("1.5")
    expect(D.fractionDigits("1.50")).toBe(2)
  })
})
