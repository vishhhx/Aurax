import type { Metadata } from "next"
import { MarketDetail } from "@/components/markets/market-detail"
import { canonicalSymbol } from "@/lib/api/market"

export async function generateMetadata({ params }: PageProps<"/markets/[symbol]">): Promise<Metadata> {
  const { symbol } = await params
  return { title: `${canonicalSymbol(symbol)} market` }
}

export default async function MarketPage({ params }: PageProps<"/markets/[symbol]">) {
  const { symbol } = await params
  return <MarketDetail symbol={canonicalSymbol(symbol)} />
}
