import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDownToLineIcon, ArrowRightIcon, CandlestickChartIcon, ShieldCheckIcon } from "lucide-react"
import { MarketsTable } from "@/components/markets/markets-table"
import { Hero } from "@/components/landing/hero"
import { Testimonial } from "@/components/landing/testimonial"

export const metadata: Metadata = { title: { absolute: "Aurax Exchange · Spot crypto markets" } }

const STEPS = [
  {
    icon: ArrowDownToLineIcon,
    title: "Deposit INR",
    body: "Pay with UPI, cards or netbanking through Razorpay. USDC is credited once the payment is confirmed by Razorpay's signed webhook.",
  },
  {
    icon: CandlestickChartIcon,
    title: "Trade on live books",
    body: "Limit orders with GTC, IOC and FOK, post-only, and market sells, matched with price-time priority.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Track every movement",
    body: "Open orders, fills, fees and a full balance ledger, updated in real time over a private channel.",
  },
] as const

export default function HomePage() {
  return (
    <>
      <Hero />

      <section aria-labelledby="markets-title" className="relative z-10 mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-brand">Live from the engine</p>
            <h2 id="markets-title" className="text-3xl font-medium tracking-[-1px] md:text-4xl">
              Every market, <span className="font-serif font-normal italic">streaming</span>.
            </h2>
          </div>
          <Link href="/markets" className="liquid-glass inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Explore markets
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <MarketsTable variant="compact" limit={6} />
      </section>

      <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <h2 id="how-title" className="mb-8 text-3xl font-medium tracking-[-1px] md:text-4xl">
          How Aurax <span className="font-serif font-normal italic">works</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass glass-edge group relative flex flex-col gap-4 overflow-hidden rounded-2xl p-6">
              <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-brand/10 blur-3xl transition-opacity group-hover:opacity-100 md:opacity-60" />
              <div className="liquid-glass flex size-10 items-center justify-center rounded-xl">
                <s.icon aria-hidden="true" className="size-5 text-brand" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="num text-xs text-muted-foreground">0{i + 1}</p>
                <h3 className="text-lg font-medium">{s.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Testimonial />

      <section className="px-4 pb-24 sm:px-6">
        <div className="glass glass-edge relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl px-8 py-12 md:flex-row md:items-center md:px-12">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-up/15 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-10 size-72 rounded-full bg-brand/15 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-medium tracking-[-1px] md:text-4xl">
              Ready when the <span className="font-serif font-normal italic">market</span> is.
            </h2>
            <p className="mt-2 text-muted-foreground">Open an account, deposit INR, and place your first order in minutes.</p>
          </div>
          <Link href="/register" className="relative rounded-full bg-foreground px-7 py-3 text-base font-medium text-background transition-opacity hover:opacity-90">
            Create account
          </Link>
        </div>
      </section>
    </>
  )
}
