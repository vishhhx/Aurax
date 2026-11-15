import type { Metadata } from "next"
import { PreferencesView } from "@/components/account/account-views"

export const metadata: Metadata = { title: "Preferences" }

export default function Page() {
  return <PreferencesView />
}
