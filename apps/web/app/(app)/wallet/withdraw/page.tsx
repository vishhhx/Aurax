import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpFromLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel } from "@/components/common/page"
import { Unavailable } from "@/components/common/states"

export const metadata: Metadata = { title: "Withdraw" }

/**
 * No withdrawal API exists (missing-backend-capabilities.md #1): payout rail,
 * fees, limits, address whitelisting and 2FA are undecided. No form is shown.
 */
export default function WithdrawPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Withdraw" className="mb-2" />
      <Unavailable
        icon={ArrowUpFromLineIcon}
        title="Withdrawals"
        description="Withdrawals to bank accounts or crypto addresses are not supported yet. Your balances stay in your Aurax wallet and can be traded at any time."
      >
        <Button asChild variant="outline">
          <Link href="/wallet">Back to wallet</Link>
        </Button>
      </Unavailable>
      <Panel title="Withdrawal history" bodyClassName="p-4">
        <p className="text-sm text-muted-foreground">No withdrawals can be made yet, so there is no history to show.</p>
      </Panel>
    </div>
  )
}
