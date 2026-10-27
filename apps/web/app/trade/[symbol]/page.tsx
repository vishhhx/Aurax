import type { Metadata } from "next"
import Navbar from "@/components/navbar"
import { SiteFooter } from "@/components/site-footer"
import { TradingTerminal } from "@/components/trade/trading-terminal"

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  return { title: `Trade ${symbol.toUpperCase()}` }
}

export default async function TradePage({ params }: Props) {
  const { symbol } = await params
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <TradingTerminal initialSymbol={symbol.replace(/[-_/]/g, "").toUpperCase()} />
      </main>
      <SiteFooter />
    </div>
  )
}
