import type { Metadata } from "next"
import { PageContainer, PageHeader } from "@/components/common/page"
import { SystemStatus } from "@/components/markets/system-status"

export const metadata: Metadata = { title: "System status" }

export default function StatusPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="System status" description="Checked live from your browser against the Aurax health endpoints." />
      <SystemStatus />
    </PageContainer>
  )
}
