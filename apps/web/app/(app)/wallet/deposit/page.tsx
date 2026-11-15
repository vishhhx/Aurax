import type { Metadata } from "next"
import { CoinsIcon } from "lucide-react"
import { PageHeader } from "@/components/common/page"
import { Unavailable } from "@/components/common/states"
import { DepositForm } from "@/components/wallet/deposit-form"
import { RecentDeposits } from "@/components/wallet/history"

export const metadata: Metadata = { title: "Deposit" }

export default function DepositPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Deposit" description="Buy USDC with INR. Funds are credited only after Razorpay confirms the payment." className="mb-2" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <DepositForm />
        <div className="flex flex-col gap-4">
          <Unavailable
            icon={CoinsIcon}
            title="Crypto deposits"
            description="On-chain deposit addresses are not supported yet. Use an INR deposit to fund your wallet."
            className="py-6"
          />
          <RecentDeposits />
        </div>
      </div>
    </div>
  )
}
