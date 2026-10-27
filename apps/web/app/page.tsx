import type { Metadata } from "next"

import { NeonLanding } from "@/components/landing/neon-landing"
import { LandingMarketsProvider } from "@/hooks/useLandingMarkets"

export const metadata: Metadata = {
  title: { absolute: "Aurax Exchange | Live crypto spot markets" },
}

export default function HomePage() {
  return (
    <LandingMarketsProvider>
      <main id="main-content">
        <NeonLanding />
      </main>
    </LandingMarketsProvider>
  )
}
