import type { Metadata } from "next"
import { OpenOrdersView } from "@/components/orders/orders-views"

export const metadata: Metadata = { title: "Open orders" }

export default function OpenOrdersPage() {
  return <OpenOrdersView />
}
