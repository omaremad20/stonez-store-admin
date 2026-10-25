import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full min-w-0 resize-y border border-border bg-background px-3 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
