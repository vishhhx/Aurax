import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="num text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The page you were looking for does not exist or has moved.</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/markets">Browse markets</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
