import { describe, expect, test } from "bun:test"
import { DepthBook } from "@/lib/ws/depth-book"

const L = (price: string, quantity: string) => ({ price, quantity })

describe("DepthBook (snapshot → delta → gap → resync)", () => {
  test("updates before a snapshot are ignored", () => {
    const b = new DepthBook()
    expect(b.update("2", "1", [L("10", "1")], [])).toBe("waiting")
    expect(b.view().status).toBe("waiting")
  })

  test("applies contiguous deltas and sorts bids desc / asks asc", () => {
    const b = new DepthBook()
    b.snapshot("10", [L("99", "1"), L("100", "2")], [L("102", "1"), L("101", "3")])
    expect(b.update("11", "10", [L("100", "5"), L("98", "1")], [L("101", "0")])).toBe("applied")
    const v = b.view()
    expect(v.status).toBe("synced")
    expect(v.sequenceNumber).toBe("11")
    expect(v.bids).toEqual([L("100", "5"), L("99", "1"), L("98", "1")])
    expect(v.asks).toEqual([L("102", "1")]) // quantity "0" removed 101
  })

  test("duplicates and replays are ignored", () => {
    const b = new DepthBook()
    b.snapshot("10", [L("99", "1")], [])
    b.update("11", "10", [L("99", "2")], [])
    expect(b.update("11", "10", [L("99", "7")], [])).toBe("duplicate")
    expect(b.update("9", "8", [L("99", "7")], [])).toBe("duplicate")
    expect(b.view().bids).toEqual([L("99", "2")])
  })

  test("a sequence gap stops the book until a new snapshot", () => {
    const b = new DepthBook()
    b.snapshot("10", [L("99", "1")], [])
    expect(b.update("12", "11", [L("99", "9")], [])).toBe("gap")
    expect(b.view().status).toBe("resyncing")
    expect(b.update("13", "12", [], [])).toBe("waiting")
    b.snapshot("13", [L("98", "4")], [])
    expect(b.view()).toEqual({ status: "synced", sequenceNumber: "13", bids: [L("98", "4")], asks: [] })
  })

  test("sequence numbers compare as BigInt beyond 2^53", () => {
    const b = new DepthBook()
    b.snapshot("9007199254740993", [], [])
    expect(b.update("9007199254740994", "9007199254740993", [L("1", "1")], [])).toBe("applied")
  })

  test("a lower sequence after an engine restart is accepted via snapshot", () => {
    const b = new DepthBook()
    b.snapshot("500", [L("1", "1")], [])
    b.snapshot("3", [L("2", "1")], [])
    expect(b.update("4", "3", [L("2", "5")], [])).toBe("applied")
    expect(b.view().bids).toEqual([L("2", "5")])
  })
})
