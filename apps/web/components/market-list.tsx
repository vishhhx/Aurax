"use client"
import TradingChart from "./trading-chart"

type Market = {
  symbol: string
  name: string
  price: number
  change: number
}

const MARKETS: Market[] = [
  { symbol: "AURX", name: "Aurax", price: 12.34, change: 2.3 },
  { symbol: "BTC", name: "Bitcoin", price: 56932.12, change: -1.2 },
  { symbol: "ETH", name: "Ethereum", price: 3412.5, change: 0.8 },
  { symbol: "USDT", name: "Tether", price: 1.0, change: 0.0 },
]

export default function MarketList() {
  return (
    <div className="w-full rounded-lg border bg-muted/5">
      <div className="grid grid-cols-3 gap-4 p-4">
        {MARKETS.map((m, i) => (
          <div key={m.symbol} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{m.symbol}</div>
              <div
                className={`text-sm ${m.change >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {m.change >= 0 ? "+" : ""}
                {m.change}%
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              ${m.price.toLocaleString()}
            </div>
            <div className="mt-2">
              <TradingChart
                points={40}
                width={220}
                height={60}
                small
                seed={i + 10}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
