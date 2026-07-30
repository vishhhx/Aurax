"use client"

import { Provider } from "react-redux"
import { store } from "@/store"
import { SessionBootstrap } from "@/components/session-bootstrap"

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SessionBootstrap>{children}</SessionBootstrap>
    </Provider>
  )
}
