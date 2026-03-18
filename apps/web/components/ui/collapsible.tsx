"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

interface CollapsibleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  defaultOpen?: boolean
}

function Collapsible({ title, defaultOpen = false, className, children, ...props }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn("border border-border rounded-xl overflow-hidden", className)} {...props}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted/60 transition-colors"
      >
        {title}
        <ChevronDownIcon
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

export { Collapsible }
