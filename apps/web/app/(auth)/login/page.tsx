import type { Metadata } from "next"
import { Suspense } from "react"
import { OAuthAuthForm } from "@/components/auth/auth-form"

export const metadata: Metadata = { title: "Log in" }

export default function LoginPage() {
  return (
    <Suspense>
      <OAuthAuthForm mode="login" />
    </Suspense>
  )
}
