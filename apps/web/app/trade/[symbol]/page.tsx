import type { Metadata } from "next"
import { TradingTerminal } from "@/components/trade/trading-terminal"
import { canonicalSymbol } from "@/lib/api/market"

export async function generateMetadata({ params }: PageProps<"/trade/[symbol]">): Promise<Metadata> {
  const { symbol } = await params
  return { title: `Trade ${canonicalSymbol(symbol)}` }
}

export default async function TradePage({ params }: PageProps<"/trade/[symbol]">) {
  const { symbol } = await params
  return <TradingTerminal symbol={canonicalSymbol(symbol)} />
}
