"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/common/states"
import { useRequireAuth } from "@/hooks/use-account"
import { useAppDispatch } from "@/hooks/useRedux"
import { fetchSession } from "@/store/slices/auth"

/**
 * Client-side guard for account screens. The backend enforces authorisation
 * on every request; this only decides what to render while the cookie
 * session is checked, and redirects signed-out visitors to /login.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()
  const { status, error, isAuthenticated } = useRequireAuth()

  if (status === "error") {
    return <ErrorState title="We couldn't check your session" message={error ?? "The API is unreachable."} onRetry={() => void dispatch(fetchSession())} />
  }
  if (!isAuthenticated) {
    return (
      <div aria-busy="true" aria-label="Checking your session" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  return <>{children}</>
}
