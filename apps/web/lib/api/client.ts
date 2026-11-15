import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios"
import type { ApiEnvelope } from "./types"

/**
 * The only HTTP client. Everything goes to api-gateway with credentials: the
 * session lives in HttpOnly cookies that JavaScript never reads.
 *
 * On a 401 the client refreshes once (single-flight: refresh tokens are single
 * use, so concurrent refreshes would revoke each other) and retries. When the
 * refresh itself fails, session-expired listeners run so app state can be
 * cleared; callers still receive the original error.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
})

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean
    skipAuthRefresh?: boolean
  }
}

// ─── Errors ───────────────────────────────────────────────────────────

export interface FieldIssue {
  field?: string
  message?: string
  code?: string
}

/** A failed request, normalised from every service's error envelope. */
export class ApiError extends Error {
  readonly status: number | null
  readonly issues: FieldIssue[]
  readonly retryAfter: number | null

  constructor(message: string, status: number | null, issues: FieldIssue[] = [], retryAfter: number | null = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.issues = issues
    this.retryAfter = retryAfter
  }

  /** True when a field or code appears in errors[] (order rules, reservation codes). */
  has(codeOrField: string): boolean {
    return this.issues.some((i) => i.code === codeOrField || i.message === codeOrField || i.field === codeOrField)
  }

  get isNetwork() {
    return this.status === null
  }
}

/**
 * errors[] differs by service: {field, message} pairs (order), [{code}]
 * (reservations), strings (market) or zod issues (wallet history).
 */
function normaliseIssues(raw: unknown): FieldIssue[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e): FieldIssue => {
    if (typeof e === "string") return { message: e }
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>
      const path = Array.isArray(o.path) ? o.path.join(".") : undefined
      return {
        field: typeof o.field === "string" ? o.field : path,
        message: typeof o.message === "string" ? o.message : undefined,
        code: typeof o.code === "string" ? o.code : undefined,
      }
    }
    return {}
  })
}

export function toApiError(err: unknown, fallback = "Something went wrong"): ApiError {
  if (err instanceof ApiError) return err
  if (axios.isAxiosError(err)) {
    const res = err.response
    if (!res) {
      const message = err.code === "ECONNABORTED" ? "The request timed out" : "Cannot reach the Aurax API"
      return new ApiError(message, null)
    }
    const body = res.data as Partial<ApiEnvelope<unknown>> | undefined
    const retryHeader = res.headers?.["retry-after"]
    const retryAfter = retryHeader !== undefined && Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : null
    let message = typeof body?.message === "string" && body.message ? body.message : fallback
    if (res.status === 429) message = retryAfter ? `Too many requests. Try again in ${retryAfter}s.` : "Too many requests. Slow down and try again."
    if ((res.status === 502 || res.status === 504) && !body?.message) message = "The service is temporarily unavailable"
    return new ApiError(message, res.status, normaliseIssues(body?.errors), retryAfter)
  }
  return new ApiError(err instanceof Error ? err.message : fallback, null)
}

// ─── Refresh ──────────────────────────────────────────────────────────

const REFRESH_PATH = "/api/v1/auth/sessions/refresh"

let refreshing: Promise<void> | null = null
const expiredListeners = new Set<() => void>()
const refreshedListeners = new Set<() => void>()

export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener)
  return () => void expiredListeners.delete(listener)
}

/** Fires after a successful cookie rotation (the socket reconnects to pick it up). */
export function onSessionRefreshed(listener: () => void) {
  refreshedListeners.add(listener)
  return () => void refreshedListeners.delete(listener)
}

export function refreshSession(): Promise<void> {
  refreshing ??= http
    .post<ApiEnvelope<{ accessToken: string }>>(REFRESH_PATH, undefined, { skipAuthRefresh: true })
    .then((res) => {
      if (!res.data?.success) throw new Error("Token refresh was not accepted")
      refreshedListeners.forEach((l) => l())
    })
    .catch((err: unknown) => {
      expiredListeners.forEach((l) => l())
      throw err
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function needsRefresh(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  if (error.response?.status === 401) return true
  // Older auth middleware answered 400 with this message for a missing session.
  const message = (error.response?.data as { message?: unknown } | undefined)?.message
  return typeof message === "string" && message.toLowerCase() === "refresh token is required."
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const original = axios.isAxiosError(error) ? (error.config as InternalAxiosRequestConfig | undefined) : undefined
    if (!original || !needsRefresh(error) || original._retry || original.skipAuthRefresh || original.url?.includes(REFRESH_PATH)) {
      return Promise.reject(error)
    }
    original._retry = true
    try {
      await refreshSession()
    } catch {
      return Promise.reject(error)
    }
    return http(original)
  },
)

// ─── Typed helpers (return the envelope's data) ───────────────────────

type Params = Record<string, string | number | boolean | undefined | null>

function clean(params?: Params) {
  if (!params) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") out[k] = v
  return out
}

export async function apiGet<T>(path: string, params?: Params, config?: AxiosRequestConfig): Promise<T> {
  try {
    const res = await http.get<ApiEnvelope<T>>(path, { ...config, params: clean(params) })
    return res.data.data
  } catch (err) {
    throw toApiError(err)
  }
}

export async function apiPost<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<{ data: T; message: string; status: number }> {
  try {
    const res = await http.post<ApiEnvelope<T>>(path, body, config)
    return { data: res.data.data, message: res.data.message, status: res.status }
  } catch (err) {
    throw toApiError(err)
  }
}

export async function apiDelete<T>(path: string, config?: AxiosRequestConfig): Promise<{ data: T; message: string; status: number }> {
  try {
    const res = await http.delete<ApiEnvelope<T>>(path, config)
    return { data: res.data.data, message: res.data.message, status: res.status }
  } catch (err) {
    throw toApiError(err)
  }
}
