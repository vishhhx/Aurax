import type { NextConfig } from "next"

const isDevelopment = process.env.NODE_ENV === "development"
const connectSources = [
  "'self'",
  "http://localhost:5000",
  "ws://localhost:5000",
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NEXT_PUBLIC_SOCKET_URL,
]
  .filter(Boolean)
  .join(" ")

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  "frame-src 'self' https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ]
  },
}

export default nextConfig
