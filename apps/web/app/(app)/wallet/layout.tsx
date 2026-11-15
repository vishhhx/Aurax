import { SectionNav } from "@/components/common/section-nav"

const ITEMS = [
  { href: "/wallet", label: "Overview", exact: true },
  { href: "/wallet/deposit", label: "Deposit" },
  { href: "/wallet/withdraw", label: "Withdraw" },
  { href: "/wallet/history", label: "History" },
]

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav items={ITEMS} />
      {children}
    </>
  )
}
