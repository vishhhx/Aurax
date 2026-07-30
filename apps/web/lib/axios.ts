import axios from "axios"
import type { InternalAxiosRequestConfig } from "axios"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean
    skipAuthRefresh?: boolean
  }
}

let isRefreshing = false
let pendingQueue: {
  resolve: () => void
  reject: (reason?: unknown) => void
}[] = []

function processQueue(error?: unknown) {
  pendingQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve()
    }
  })
  pendingQueue = []
}

function requiresCookieRefresh(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false

  if (error.response?.status === 401) return true

  // Compatibility for the current backend response. The backend should
  // ultimately return 401 for an expired/missing access session instead of
  // using 400 with this message.
  const message =
    typeof error.response?.data?.message === "string"
      ? error.response.data.message.toLowerCase()
      : ""

  return message === "refresh token is required."
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig | undefined

    if (
      requiresCookieRefresh(error) &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !originalRequest.url?.includes("/sessions/refresh")
    ) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          pendingQueue.push({ resolve: () => resolve(), reject })
        })
          .then(() => api(originalRequest))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {

        // Use the configured client so the refresh request always uses the
        // same API origin and credential settings as the failed request. The
        // flag prevents a failed refresh from attempting to refresh itself.
        const refreshResponse = await api.post(
          "/api/v1/auth/sessions/refresh",
          {},
          {
            skipAuthRefresh: true,
          },
        )

        if (!refreshResponse.data?.success) {
          throw new Error("Token refresh was not accepted")
        }

        processQueue()
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError)
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
