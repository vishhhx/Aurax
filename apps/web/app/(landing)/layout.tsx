import { SiteFooter } from "@/components/app/site-footer"

/**
 * Marketing landing. Always dark (the design is built on a black canvas and a
 * night-garden video), independent of the visitor's app theme; the hero
 * carries its own navbar, so the app header is not rendered here.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-svh flex-col bg-background text-foreground">
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
