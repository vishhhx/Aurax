import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/common/page"
import { FeesTable } from "@/components/markets/fees-table"

export const metadata: Metadata = { title: "Fees and trading rules" }

export default function FeesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Fees and trading rules"
        description="Maker and taker fees are charged in the quote asset of each fill. A limit buy reserves its value plus the higher fee rate until it closes; unused funds are released."
      />
      <FeesTable />
    </PageContainer>
  )
}
