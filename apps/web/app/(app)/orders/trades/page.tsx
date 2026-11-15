import type { Metadata } from "next"
import { TradeHistoryView } from "@/components/orders/orders-views"

export const metadata: Metadata = { title: "Trade history" }

export default function TradeHistoryPage() {
  return <TradeHistoryView />
}
