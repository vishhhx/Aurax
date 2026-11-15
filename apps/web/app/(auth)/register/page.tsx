import type { Metadata } from "next"
import { Suspense } from "react"
import { OAuthAuthForm } from "@/components/auth/auth-form"

export const metadata: Metadata = { title: "Create account" }

export default function RegisterPage() {
  return (
    <Suspense>
      <OAuthAuthForm mode="register" />
    </Suspense>
  )
}
