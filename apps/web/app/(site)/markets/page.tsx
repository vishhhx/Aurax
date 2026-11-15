import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/common/page"
import { MarketsTable } from "@/components/markets/markets-table"

export const metadata: Metadata = { title: "Markets" }

export default function MarketsPage() {
  return (
    <PageContainer>
      <PageHeader title="Markets" description="Every spot market listed on Aurax, with live 24-hour statistics." />
      <MarketsTable />
    </PageContainer>
  )
}
