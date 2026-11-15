import { SiteHeader } from "@/components/app/site-header"

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  )
}
