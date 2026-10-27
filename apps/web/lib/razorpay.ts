const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export type RazorpayFailureResponse = {
  error: {
    code: string
    description: string
    reason?: string
    metadata?: { order_id?: string; payment_id?: string }
  }
}

export type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  order_id: string
  name?: string
  description?: string
  image?: string
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  modal?: {
    backdropclose?: boolean
    escape?: boolean
    animation?: boolean
    confirm_close?: boolean
    ondismiss?: () => void
  }
  retry?: { enabled: boolean; max_count?: number }
  handler: (response: RazorpaySuccessResponse) => void
}

export type RazorpayInstance = {
  open: () => void
  on: (event: "payment.failed", cb: (response: RazorpayFailureResponse) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

let loader: Promise<boolean> | null = null

/**
 * Loads Razorpay Checkout once. Safe to call on hover/focus to warm the script
 * before the user clicks pay; repeated calls share the same promise.
 */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)

  loader ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script")
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => {
      script.remove()
      loader = null
      resolve(false)
    }
    document.body.appendChild(script)
  })

  return loader
}
