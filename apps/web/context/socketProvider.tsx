"use client"

import { createContext, useContext, useEffect, useMemo } from "react"
import { getSocket } from "@/lib/socket"

const SocketContext = createContext(getSocket())

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socket = useMemo(() => getSocket(), [])

  useEffect(() => {
    socket.connect()

    return () => {
      socket.disconnect()
    }
  }, [socket])

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
