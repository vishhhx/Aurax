"use client"

import { useEffect } from "react"
import { Provider } from "react-redux"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AccountSync } from "@/components/app/account-sync"
import { hydratePreferences } from "@/lib/stores/preferences"
import { acquireSocket } from "@/lib/ws"
import { useAppDispatch } from "@/hooks/useRedux"
import { store } from "@/store"
import { fetchSession } from "@/store/slices/auth"

/** Once per app load: ask the server for the cookie session, open the socket, load device preferences. */
function Bootstrap() {
  const dispatch = useAppDispatch()
  useEffect(() => {
    void dispatch(fetchSession())
    hydratePreferences()
    return acquireSocket()
  }, [dispatch])
  return null
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider delayDuration={300}>
          <Bootstrap />
          <AccountSync />
          {children}
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </Provider>
  )
}
