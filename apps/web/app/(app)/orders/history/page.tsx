import type { Metadata } from "next"
import { OrderHistoryView } from "@/components/orders/orders-views"

export const metadata: Metadata = { title: "Order history" }

export default function OrderHistoryPage() {
  return <OrderHistoryView />
}
