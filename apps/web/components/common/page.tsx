import { cn } from "@/lib/utils"

export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8", className)}>{children}</div>
}

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** A bordered surface with an optional title row — the basic block of every screen. */
export function Panel({
  title,
  actions,
  className,
  bodyClassName,
  children,
  id,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col rounded-xl border bg-panel glass-edge", className)}>
      {title || actions ? (
        <header className="flex min-h-10 items-center justify-between gap-2 border-b px-4 py-2">
          {typeof title === "string" ? <h2 className="text-sm font-medium">{title}</h2> : title}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  )
}

/** Label/value rows for detail views. */
export function DetailList({ items, className }: { items: Array<{ label: string; value: React.ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline justify-between gap-4 border-b border-dashed pb-2 sm:block sm:border-0 sm:pb-0">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0 text-right font-medium break-words sm:mt-0.5 sm:text-left">{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}
