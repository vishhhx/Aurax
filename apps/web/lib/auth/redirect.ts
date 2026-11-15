/**
 * Where to send the user after sign-in. The OAuth round trip always lands on
 * /auth/success, so the target is parked in sessionStorage (a path only,
 * never a credential) before leaving for the provider.
 */

const KEY = "aurax.postLoginPath"
export const DEFAULT_AFTER_LOGIN = "/dashboard"

/** Only same-origin absolute paths: "/x" but not "//evil.com" or "/\\evil". */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null
  if (value.startsWith("/login") || value.startsWith("/register") || value.startsWith("/auth/")) return null
  return value
}

export function rememberNextPath(path: string | null) {
  try {
    if (path) sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage disabled: fall back to the default destination.
  }
}

export function takeNextPath(): string {
  try {
    const v = safeNextPath(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return v ?? DEFAULT_AFTER_LOGIN
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
}
