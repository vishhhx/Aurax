"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAppSelector } from "@/hooks/useRedux"

export default function AuthSuccessPage() {
  const router = useRouter()
  const status = useAppSelector((state) => state.auth.status)

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard")
    } else if (status === "unauthenticated") {
      router.replace("/login?error=auth_failed")
    }
  }, [router, status])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-10 animate-spin text-emerald-400" />
        <p className="text-sm font-medium text-muted-foreground">
          Completing sign in…
        </p>
      </div>
    </div>
  )
}
