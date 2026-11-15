import * as React from "react"

import { cn } from "@/lib/utils"

/** The group draws the border and focus ring; the input and addons sit inside it. */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "group/input-group relative flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "has-[[data-slot=input-group-input]:focus-visible]:border-ring has-[[data-slot=input-group-input]:focus-visible]:ring-3 has-[[data-slot=input-group-input]:focus-visible]:ring-ring/50",
        "has-[[data-slot=input-group-input][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-input][aria-invalid=true]]:ring-destructive/20",
        "has-[[data-slot=input-group-input]:disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "h-full w-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  align = "inline-start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex h-full shrink-0 items-center gap-1 text-sm text-muted-foreground select-none [&>svg]:size-4",
        "data-[align=inline-start]:order-first data-[align=inline-start]:pl-3 data-[align=inline-end]:order-last data-[align=inline-end]:pr-3",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
