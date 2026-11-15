"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/** Route-backed tabs for a section (each tab is a real, linkable page). */
export function SectionNav({ items, className }: { items: Array<{ href: string; label: string; exact?: boolean }>; className?: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Section" className={cn("mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]", className)}>
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}
