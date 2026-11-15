import { SiteHeader } from "@/components/app/site-header"
import { PageContainer } from "@/components/common/page"
import { RequireAuth } from "@/components/app/require-auth"

/** Signed-in area: dashboard, wallet, orders and account settings. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <PageContainer>
          <RequireAuth>{children}</RequireAuth>
        </PageContainer>
      </main>
    </div>
  )
}
