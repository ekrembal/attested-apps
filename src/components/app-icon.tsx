import { AppWindow } from "lucide-react"
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic"

import { cn } from "@/lib/utils"

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase()
const known = new Set<string>(iconNames)

/** Icon named in the app's signed app.json (lucide PascalCase name), loaded on demand. */
export function AppIcon({ name, className }: { name: string; className?: string }) {
  const icon = kebab(name)
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-foreground [&_svg]:size-1/2",
        className
      )}
    >
      {known.has(icon) ? <DynamicIcon name={icon as IconName} fallback={() => <AppWindow />} /> : <AppWindow />}
    </div>
  )
}
