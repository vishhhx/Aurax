"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAppSelector } from "@/hooks/useRedux"
import {
  selectIsAuthenticated,
  selectIsSessionLoading,
} from "@/store/slices/authSlice"

export function useRequireAuth(redirectTo = "/login") {
  const router = useRouter()
  const status = useAppSelector((s) => s.auth.status)
  const error = useAppSelector((s) => s.auth.error)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const isLoading = useAppSelector(selectIsSessionLoading)

  useEffect(() => {
    // Wait for SessionBootstrap. Redirecting while status is unknown/checking
    // is the source of the refresh flicker.
    if (status === "unauthenticated") {
      router.replace(redirectTo)
    }
  }, [router, redirectTo, status])

  return { isAuthenticated, isLoading, status, error }
}
