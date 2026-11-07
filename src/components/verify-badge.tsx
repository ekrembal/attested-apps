import { CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, FlaskConical } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CheckStatus, Overall, VerifyResult } from "@/lib/verify"

const OVERALL: Record<Overall, { label: string; hint: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  verified: { label: "Verified", hint: "Signature, prompt chain and hardware attestation verified", variant: "default", icon: <CircleCheck /> },
  partial: { label: "Signed", hint: "Signature and prompt chain verified. Hardware quote check is pending.", variant: "secondary", icon: <Clock /> },
  dev: { label: "Dev build", hint: "Signature and prompt chain verified, but it was built in dev mode: no enclave attestation.", variant: "outline", icon: <FlaskConical /> },
  failed: { label: "Failed", hint: "One or more checks failed. Do not trust this app.", variant: "destructive", icon: <CircleX /> },
}

export function VerifyBadge({ result }: { result?: VerifyResult }) {
  if (!result)
    return (
      <Badge variant="outline">
        <Spinner /> Checking
      </Badge>
    )
  const o = OVERALL[result.overall]
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant={o.variant} />}>
        {o.icon}
        {o.label}
      </TooltipTrigger>
      <TooltipContent>{o.hint}</TooltipContent>
    </Tooltip>
  )
}

export function CheckIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pass":
      return <CircleCheck className="text-foreground" />
    case "fail":
      return <CircleX className="text-destructive" />
    case "warn":
      return <CircleAlert className="text-muted-foreground" />
    default:
      return <CircleDashed className="text-muted-foreground" />
  }
}

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Warning",
  deferred: "Pending",
}
