import type { LucideIcon } from "lucide-react"
import { CircleAlertIcon, CircleSlashIcon, InboxIcon, RotateCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * A feature the backend does not provide yet. Stated plainly so nothing
 * looks operational when it is not (docs/frontend-integration/missing-backend-capabilities.md).
 */
export function Unavailable({
  title,
  description,
  icon: Icon = CircleSlashIcon,
  className,
  children,
}: {
  title: string
  description: string
  icon?: LucideIcon
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Empty className={cn("rounded-lg border border-dashed py-10", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <div className="flex items-center gap-2">
          <EmptyTitle>{title}</EmptyTitle>
          <Badge variant="outline" className="rounded-md text-muted-foreground">
            Not available
          </Badge>
        </div>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  )
}

export function EmptyState({ title, description, icon: Icon = InboxIcon, className, children }: { title: string; description?: string; icon?: LucideIcon; className?: string; children?: React.ReactNode }) {
  return (
    <Empty className={cn("py-10", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  )
}

export function ErrorState({ title = "Could not load", message, onRetry, className }: { title?: string; message?: string | null; onRetry?: () => void; className?: string }) {
  return (
    <Empty className={cn("py-10", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {message ? <EmptyDescription>{message}</EmptyDescription> : null}
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCwIcon data-icon="inline-start" />
            Try again
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
