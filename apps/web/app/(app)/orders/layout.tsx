import { PageHeader } from "@/components/common/page"
import { SectionNav } from "@/components/common/section-nav"

const ITEMS = [
  { href: "/orders", label: "Open orders", exact: true },
  { href: "/orders/history", label: "Order history" },
  { href: "/orders/trades", label: "Trade history" },
]

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Orders" description="Orders are processed asynchronously: Pending means accepted and reserved, not executed." className="mb-4" />
      <SectionNav items={ITEMS} />
      {children}
    </>
  )
}
