import { PageHeader } from "@/components/common/page"
import { SectionNav } from "@/components/common/section-nav"

const ITEMS = [
  { href: "/account", label: "Profile", exact: true },
  { href: "/account/security", label: "Security" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/preferences", label: "Preferences" },
  { href: "/account/api-keys", label: "API keys" },
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Account" className="mb-4" />
      <SectionNav items={ITEMS} />
      {children}
    </div>
  )
}
