import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter, Instrument_Serif } from "next/font/google"
import "./globals.css"
import { AppProviders } from "@/components/app/providers"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
// Accent serif for single italic words in display headings (self-hosted by next/font).
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" })

export const metadata: Metadata = {
  title: {
    default: "Aurax Exchange",
    template: "%s · Aurax",
  },
  description: "Spot crypto trading on the Aurax matching engine, with INR deposits through Razorpay.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", inter.variable, mono.variable, serif.variable, "font-sans")}>
      <body className="min-h-svh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
