import type { Metadata } from "next"
import { PageHeader } from "@/components/common/page"
import { BalancesTable, PortfolioSummary } from "@/components/wallet/balances"

export const metadata: Metadata = { title: "Wallet" }

export default function WalletPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Wallet" description="Available balances can be traded or withdrawn; balances in orders are reserved until those orders close." className="mb-2" />
      <PortfolioSummary />
      <BalancesTable />
    </div>
  )
}
