"use client"

import { useEffect } from "react"
import { useAppDispatch } from "@/hooks/useRedux"
import { fetchUserDetails } from "@/store/slices/authSlice"

/**
 * Runs once for each browser app load. This is deliberately a Client
 * Component: a server RootLayout cannot dispatch into the browser Redux store.
 */
export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    void dispatch(fetchUserDetails())
  }, [dispatch])

  return <>{children}</>
}
