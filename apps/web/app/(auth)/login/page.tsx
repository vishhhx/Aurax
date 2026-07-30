"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/axios"

export default function LoginPage() {
  const params = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(
    null
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const err = params.get("error")
    if (err === "auth_failed")
      setErrorMsg("Authentication failed. Please try again.")
  }, [params])
  const handleOAuthRedirect = async (provider: "google" | "github") => {
    setOauthLoading(provider)
    setErrorMsg(null)
    try {
      const res = await api.get<{ success: boolean; data: string; message: string; statusCode: number }>(
        `/api/v1/auth/oauth2/${provider}`,
        { validateStatus: (status) => status < 500 },
      )
      const redirectUrl = res.data?.data
      if (res.data?.success && redirectUrl) {
        window.location.href = redirectUrl
        return
      }
      throw new Error(res.data?.message || "No redirect URL returned from server")
    } catch (err: any) {
      if (err.response?.data?.success && err.response?.data?.data) {
        window.location.href = err.response.data.data
        return
      }
      setOauthLoading(null)
      const message =
        err.response?.data?.message ||
        err.message ||
        `Failed to initiate ${provider === "google" ? "Google" : "GitHub"} sign-in. Please try again.`
      setErrorMsg(message)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg(null)
    try {
      await new Promise((r) => setTimeout(r, 800))
      setErrorMsg(
        "Email/password login is not yet enabled. Please use Google or GitHub sign-in."
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your Aurax account to continue trading
          </p>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* OAuth Buttons — Primary CTAs */}
        <div className="space-y-3">
          <Button
            id="btn-google-login"
            type="button"
            variant="outline"
            className="relative h-11 w-full gap-3 border-border/60 bg-card/40 transition-all hover:bg-muted/60"
            onClick={() => handleOAuthRedirect("google")}
            disabled={isLoading || oauthLoading !== null}
          >
            {oauthLoading === "google" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span className="font-medium">Continue with Google</span>
          </Button>

          <Button
            id="btn-github-login"
            type="button"
            variant="outline"
            className="relative h-11 w-full gap-3 border-border/60 bg-card/40 transition-all hover:bg-muted/60"
            onClick={() => handleOAuthRedirect("github")}
            disabled={isLoading || oauthLoading !== null}
          >
            {oauthLoading === "github" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            )}
            <span className="font-medium">Continue with GitHub</span>
          </Button>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or sign in with email
            </span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10"
              disabled={isLoading || oauthLoading !== null}
            />
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 pr-10"
                disabled={isLoading || oauthLoading !== null}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button
            id="btn-email-login"
            type="submit"
            className="h-10 w-full"
            disabled={isLoading || oauthLoading !== null}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            Don&apos;t have an account?{" "}
          </span>
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
