import type { Metadata } from "next"
import { PageHeader } from "@/components/common/page"
import { DepositStatusView } from "@/components/wallet/deposit-status"

export const metadata: Metadata = { title: "Deposit" }

export default async function DepositDetailPage({ params }: PageProps<"/wallet/deposits/[depositId]">) {
  const { depositId } = await params
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Deposit" className="mb-2" />
      <DepositStatusView depositId={decodeURIComponent(depositId)} />
    </div>
  )
}
