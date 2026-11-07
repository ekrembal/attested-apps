import * as React from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              } catch {
                toast.error("Clipboard unavailable")
              }
            }}
          />
        }
      >
        {copied ? <Check /> : <Copy />}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  )
}

/** Monospace hash with copy action. */
export function HashValue({ value, short = true }: { value: string; short?: boolean }) {
  const shown = short && value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-10)}` : value
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-xs" title={value}>
        {shown}
      </code>
      <CopyButton value={value} />
    </span>
  )
}
