import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <Image src="/logo.svg" alt="" width={26} height={26} className="rounded-[8px]" priority />
      {compact ? null : <span className="text-[15px] font-semibold tracking-tight">Aurax</span>}
      <span className="sr-only">Aurax home</span>
    </Link>
  )
}
