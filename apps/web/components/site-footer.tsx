import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import { BrandLogo } from "@/components/navbar"

const FOOTER_COLUMNS = [
  {
    title: "Products",
    links: [
      { href: "/#markets", label: "Spot markets" },
      { href: "/#trade", label: "Trading console" },
      { href: "/payment/razorpay", label: "Buy USDC with INR" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/register", label: "Create account" },
      { href: "/login", label: "Log in" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/support", label: "Support" },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <BrandLogo className="w-fit" />
          <p className="max-w-xs text-sm text-muted-foreground">
            A centralized crypto exchange with instant INR deposits and a
            microsecond matching engine.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{col.title}</h2>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <Separator />
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Aurax Exchange. All rights reserved.</p>
        <p>Crypto assets are volatile. Trade responsibly.</p>
      </div>
    </footer>
  )
}
