"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { ErrorState } from "@/components/common/states"
import { useAuth } from "@/hooks/use-account"
import { useAppDispatch } from "@/hooks/useRedux"
import { takeNextPath } from "@/lib/auth/redirect"
import { fetchSession } from "@/store/slices/auth"

/**
 * OAuth callback landing (the backend redirects here after setting the
 * session cookies). Confirms the session with GET /auth/details, then
 * continues to the page the user started from.
 */
export default function AuthSuccessPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { status, error } = useAuth()

  useEffect(() => {
    if (status === "authenticated") router.replace(takeNextPath())
    else if (status === "unauthenticated") router.replace("/login?error=auth_failed")
  }, [router, status])

  if (status === "error") {
    return <ErrorState title="We couldn't confirm your session" message={error} onRetry={() => void dispatch(fetchSession())} className="min-h-svh" />
  }
  return (
    <main id="main" className="flex min-h-svh items-center justify-center gap-3 text-sm text-muted-foreground" aria-busy="true">
      <Spinner />
      Completing sign-in…
    </main>
  )
}
