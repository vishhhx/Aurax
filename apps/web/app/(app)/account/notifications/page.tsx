import type { Metadata } from "next"
import { NotificationsView } from "@/components/account/account-views"

export const metadata: Metadata = { title: "Notifications" }

export default function Page() {
  return <NotificationsView />
}
