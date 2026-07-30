import * as React from "react"

import { cn } from "@/lib/utils"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn("relative flex w-full items-center", className)}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "h-14 w-full min-w-0 rounded-lg border border-input bg-transparent px-3.5 text-xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  align = "inline-end",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "pointer-events-none absolute inset-y-0 flex items-center text-muted-foreground data-[align=inline-end]:right-4 data-[align=inline-start]:left-4",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
