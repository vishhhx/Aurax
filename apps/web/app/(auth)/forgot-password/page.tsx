import type { Metadata } from "next"
import Link from "next/link"
import { KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Unavailable } from "@/components/common/states"

export const metadata: Metadata = { title: "Reset password" }

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
      <Unavailable
        icon={KeyRoundIcon}
        title="Password reset"
        description="Aurax accounts sign in with Google or GitHub, so there is no Aurax password to reset. If you can't access your provider account, recover it with Google or GitHub."
      >
        <Button asChild variant="outline">
          <Link href="/login">Back to log in</Link>
        </Button>
      </Unavailable>
    </div>
  )
}
