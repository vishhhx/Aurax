import Link from "next/link"
import { BrandLogo } from "@/components/common/brand"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between border-r bg-panel p-10 lg:flex">
        <BrandLogo />
        <div className="flex max-w-md flex-col gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">Spot markets on the Aurax matching engine.</h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>Sign in with your Google or GitHub account.</li>
            <li>Deposit INR through Razorpay and trade with USDC.</li>
            <li>Live order books, fills and balances over a private channel.</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          <Link href="/status" className="hover:text-foreground">
            System status
          </Link>
        </p>
      </aside>
      <main id="main" className="flex flex-col">
        <div className="flex h-14 items-center justify-between px-6 lg:hidden">
          <BrandLogo />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  )
}
