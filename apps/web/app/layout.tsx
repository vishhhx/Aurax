import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ReduxProvider } from "@/components/providers"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SocketProvider } from "@/context/socketProvider"
import { AccountEventsBridge } from "@/components/account-events-bridge"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Aurax Exchange | Buy, sell & trade crypto",
    template: "%s | Aurax Exchange",
  },
  description:
    "Aurax is a centralized crypto exchange with instant INR deposits, deep order books and a microsecond matching engine.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ReduxProvider>
          <SocketProvider>
            <AccountEventsBridge />
            <ThemeProvider defaultTheme="dark">
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster richColors position="top-center" />
            </ThemeProvider>
          </SocketProvider>
        </ReduxProvider>
      </body>
    </html>
  )
}
