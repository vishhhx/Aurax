import type { Metadata } from "next"
import { OrderDetailView } from "@/components/orders/orders-views"

export const metadata: Metadata = { title: "Order details" }

export default async function OrderDetailPage({ params }: PageProps<"/orders/[orderId]">) {
  const { orderId } = await params
  return <OrderDetailView orderId={decodeURIComponent(orderId)} />
}
