import type { Metadata } from "next"
import { ProfileView } from "@/components/account/account-views"

export const metadata: Metadata = { title: "Profile" }

export default function Page() {
  return <ProfileView />
}
