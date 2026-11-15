import type { Metadata } from "next"
import { ArrowUpFromLineIcon } from "lucide-react"
import { PageHeader } from "@/components/common/page"
import { Unavailable } from "@/components/common/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DepositHistory, LedgerHistory } from "@/components/wallet/history"

export const metadata: Metadata = { title: "Wallet history" }

export default function WalletHistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="History" description="Deposits and every balance movement recorded in your ledger." className="mb-2" />
      <Tabs defaultValue="transactions" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions">
          <LedgerHistory />
        </TabsContent>
        <TabsContent value="deposits">
          <DepositHistory />
        </TabsContent>
        <TabsContent value="withdrawals">
          <Unavailable icon={ArrowUpFromLineIcon} title="Withdrawals" description="Withdrawals are not supported yet, so there is no withdrawal history." />
        </TabsContent>
      </Tabs>
    </div>
  )
}
