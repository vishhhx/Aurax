import Link from "next/link"
import { BrandLogo } from "@/components/common/brand"

const COLUMNS = [
  {
    title: "Exchange",
    links: [
      { href: "/markets", label: "Markets" },
      { href: "/trade", label: "Spot trading" },
      { href: "/fees", label: "Fees and trading rules" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/wallet", label: "Wallet" },
      { href: "/wallet/deposit", label: "Deposit INR" },
    ],
  },
  {
    title: "Platform",
    links: [{ href: "/status", label: "System status" }],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <BrandLogo className="w-fit" />
          <p className="max-w-xs text-sm text-muted-foreground">Spot crypto markets on the Aurax matching engine.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.title}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Aurax. Crypto assets are volatile; trade only what you can afford to lose.
        </p>
      </div>
    </footer>
  )
}
