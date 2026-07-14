"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { AnimatedMorphingIcon, shieldIcon, lockIcon, zapIcon } from "@/components/morphing-icon"

interface Feature {
  id: number
  title: string
  description: string
  iconIndex: number
  color: string
}

const features: Feature[] = [
  {
    id: 1,
    title: "Enterprise Security",
    description: "Multi-layer protection for every account.",
    iconIndex: 0,
    color: "from-blue-500/10 to-transparent",
  },
  {
    id: 2,
    title: "Lightning Fast Trading",
    description: "Execute orders with minimal latency.",
    iconIndex: 1,
    color: "from-amber-500/10 to-transparent",
  },
  {
    id: 3,
    title: "Trusted Worldwide",
    description: "Built with reliability, privacy, and transparency.",
    iconIndex: 2,
    color: "from-emerald-500/10 to-transparent",
  },
]

const iconSequence = [shieldIcon, zapIcon, lockIcon]
const iconColors = ["#3b82f6", "#f59e0b", "#10b981"]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="grid h-screen lg:grid-cols-2">
        {/* Left Side - Brand & Features */}
        <section className="hidden border-r border-border/50 bg-gradient-to-br from-background via-background to-muted/5 lg:flex relative overflow-hidden">
          {/* Animated background gradient */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "10s", animationDelay: "1s" }} />
          </div>

          <div className="relative mx-auto flex w-full flex-col items-center justify-center max-w-lg gap-12 px-12 py-16 text-center">
            {/* Logo Section */}
            <div className="space-y-6 opacity-0 animate-fade-in-up">
              <div className="flex justify-center">
                <div className="group relative">
                  <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 to-emerald-500/20 rounded-lg blur-lg group-hover:blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  <Image
                    src="/logo.png"
                    alt="Aurax Logo"
                    width={120}
                    height={120}
                    priority
                    className="relative rounded-lg shadow-lg transition-all duration-300 group-hover:shadow-2xl group-hover:scale-105"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
                  Aurax
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground max-w-sm">
                  A secure and modern cryptocurrency exchange built for effortless trading with institutional-grade security.
                </p>
              </div>
            </div>

            {/* Separator */}
            <Separator className="w-12 opacity-0 animate-fade-in-up" style={{ animationDelay: "0.15s" }} />

            {/* Features Grid */}
            <div className="flex w-full flex-col gap-3 opacity-0" style={{ animation: "fadeInUp 0.6s ease-out 0.25s forwards" }}>
              {features.map((feature) => (
                <div
                  key={feature.id}
                  onMouseEnter={() => setHoveredFeature(feature.id)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className={cn(
                    "group relative flex items-start gap-4 px-5 py-4 rounded-lg",
                    "border border-border/40 bg-card/30 backdrop-blur-sm",
                    "transition-all duration-300 cursor-pointer",
                    hoveredFeature === feature.id && "border-primary/60 bg-card/60 shadow-lg"
                  )}
                >
                  {/* Gradient background on hover */}
                  <div className={cn(
                    "absolute inset-0 rounded-lg bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10",
                    feature.color
                  )} />

                  {/* Icon */}
                  <div className="mt-0.5 flex-shrink-0 transition-transform duration-300" style={{
                    transform: hoveredFeature === feature.id ? "scale(1.15) rotate(8deg)" : "scale(1) rotate(0deg)",
                  }}>
                    {mounted && (
                      <AnimatedMorphingIcon
                        icons={iconSequence}
                        current={feature.iconIndex}
                        size={24}
                        color={iconColors[feature.iconIndex]}
                        duration={500}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <h3 className="font-semibold text-sm leading-tight transition-colors duration-300" style={{
                      color: hoveredFeature === feature.id ? "hsl(var(--primary))" : "inherit",
                    }}>
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors duration-300">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Side - Auth Forms */}
        <section className="flex items-center justify-center px-6 py-12 sm:px-12 opacity-0 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  )
}
