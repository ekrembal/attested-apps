import { Hammer, LayoutGrid, LogOut, Moon, ShieldCheck, Sun, UserRound } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { npub, shortNpub } from "@/lib/nostr"
import { href, type Route } from "@/lib/router"
import { useSession } from "@/lib/session"

function AccountMenu() {
  const { pubkey, quota, signOut } = useSession()
  if (!pubkey) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <UserRound data-icon="inline-start" />
        <span className="hidden font-mono text-xs sm:inline">{shortNpub(pubkey)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs">{shortNpub(pubkey)}</span>
            <CopyButton value={npub(pubkey)} label="Copy npub" />
          </DropdownMenuLabel>
          {quota && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {quota.remaining} of {quota.limit} builds left today
            </DropdownMenuLabel>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SiteHeader({ route }: { route: Route }) {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  const section = route.name === "build" ? "build" : "browse"
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <a href={href.browse()} className="mr-2 flex items-center gap-2 font-heading font-semibold">
          <ShieldCheck className="size-5" />
          <span className="hidden sm:inline">Attested Apps</span>
        </a>
        <nav className="flex items-center gap-1">
          <Button
            variant={section === "browse" ? "secondary" : "ghost"}
            size="sm"
            render={<a href={href.browse()} />}
            nativeButton={false}
          >
            <LayoutGrid data-icon="inline-start" />
            Browse
          </Button>
          <Button
            variant={section === "build" ? "secondary" : "ghost"}
            size="sm"
            render={<a href={href.build()} />}
            nativeButton={false}
          >
            <Hammer data-icon="inline-start" />
            Build
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <AccountMenu />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle theme"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                />
              }
            >
              {isDark ? <Sun /> : <Moon />}
            </TooltipTrigger>
            <TooltipContent>
              Toggle theme <Kbd>D</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
