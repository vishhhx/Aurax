import { redirect } from "next/navigation"

/** Former checkout URL; the deposit flow now lives in the wallet. */
export default function LegacyRazorpayPage() {
  redirect("/wallet/deposit")
}
