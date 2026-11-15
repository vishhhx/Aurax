"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleAlertIcon, InfoIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { authApi } from "@/lib/api/auth"
import type { OAuthProvider } from "@/lib/api/types"
import { DEFAULT_AFTER_LOGIN, rememberNextPath, safeNextPath } from "@/lib/auth/redirect"
import { useAuth } from "@/hooks/use-account"

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" fill="#34A853" />
      <path d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" fill="#EA4335" />
    </svg>
  )
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0a12 12 0 0 0-3.8 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0Z" />
    </svg>
  )
}

const PROVIDERS: Array<{ id: OAuthProvider; label: string; Mark: () => React.ReactElement }> = [
  { id: "google", label: "Google", Mark: GoogleMark },
  { id: "github", label: "GitHub", Mark: GitHubMark },
]

export function OAuthAuthForm({ mode }: { mode: "login" | "register" }) {
  const params = useSearchParams()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [busy, setBusy] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(params.get("error") === "auth_failed" ? "Sign-in with the provider failed or was cancelled. Please try again." : null)
  const next = safeNextPath(params.get("next"))

  useEffect(() => {
    if (isAuthenticated) router.replace(next ?? DEFAULT_AFTER_LOGIN)
  }, [isAuthenticated, next, router])

  const start = async (provider: OAuthProvider) => {
    setBusy(provider)
    setError(null)
    try {
      // Sets the HttpOnly oauthState cookie that the callback verifies.
      const url = await authApi.oauthUrl(provider)
      if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error("The server did not return a sign-in URL")
      rememberNextPath(next)
      window.location.assign(url)
    } catch (err) {
      setBusy(null)
      setError(err instanceof Error ? err.message : "Could not start sign-in")
    }
  }

  const verb = mode === "login" ? "Continue" : "Sign up"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Log in to Aurax" : "Create your Aurax account"}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "login" ? "Use the Google or GitHub account you signed up with." : "Your account is created the first time you sign in with Google or GitHub."}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        {PROVIDERS.map(({ id, label, Mark }) => (
          <Button key={id} type="button" variant="outline" size="lg" className="h-10 w-full" disabled={busy !== null} onClick={() => void start(id)}>
            {busy === id ? <Spinner data-icon="inline-start" /> : <Mark />}
            {verb} with {label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or with email
        <Separator className="flex-1" />
      </div>

      <form aria-describedby="email-unavailable" onSubmit={(e) => e.preventDefault()}>
        <FieldGroup>
          <Field data-disabled>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" disabled placeholder="you@example.com" />
          </Field>
          <Field data-disabled>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              {mode === "login" ? (
                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                  Forgot password?
                </Link>
              ) : null}
            </div>
            <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} disabled />
            <FieldDescription id="email-unavailable" className="flex items-start gap-1.5 text-xs">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Email and password {mode === "login" ? "sign-in" : "sign-up"} is not available yet. Use Google or GitHub.
            </FieldDescription>
          </Field>
          <Button type="submit" variant="secondary" disabled className="w-full">
            {mode === "login" ? "Log in" : "Create account"}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New to Aurax?{" "}
            <Link href="/register" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-foreground hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
