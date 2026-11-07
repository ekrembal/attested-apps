import * as React from "react"
import { Layers, Search, SearchX } from "lucide-react"

import { AppIcon } from "@/components/app-icon"
import { VerifyBadge } from "@/components/verify-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { splitPrompt } from "@/lib/contract"
import { formatDate } from "@/lib/format"
import { href } from "@/lib/router"
import { useStore } from "@/lib/store"
import { promptChain, type StoreApp } from "@/lib/types"

const SORTS = { newest: "Newest", name: "Name", prompts: "Most prompts" } as const
type Sort = keyof typeof SORTS

function AppCard({ app }: { app: StoreApp }) {
  const { results } = useStore()
  const p = app.envelope.statement.predicate
  const prompts = promptChain(app.envelope).length
  return (
    <a href={href.app(app.id)} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader className="flex flex-row items-start gap-3">
          <AppIcon name={app.icon} />
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">{app.name}</CardTitle>
            <CardDescription className="line-clamp-2">{app.tagline}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="line-clamp-2 text-sm text-muted-foreground italic">“{splitPrompt(p.prompt).user}”</p>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-1.5">
          <VerifyBadge result={results[app.id]} />
          <Badge variant="secondary">
            <Layers />
            {prompts} {prompts === 1 ? "prompt" : "prompts"}
          </Badge>
          <Badge variant="outline">{app.category}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{formatDate(app.published_at)}</span>
        </CardFooter>
      </Card>
    </a>
  )
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row gap-3">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  )
}

export function BrowsePage() {
  const { apps, loading, error } = useStore()
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState("All")
  const [sort, setSort] = React.useState<Sort>("newest")
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const categories = React.useMemo(() => ["All", ...new Set(apps.map((a) => a.category))], [apps])

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = apps.filter((a) => {
      if (category !== "All" && a.category !== category) return false
      if (!q) return true
      const prompts = promptChain(a.envelope).map((e) => splitPrompt(e.statement.predicate.prompt).user)
      return [a.name, a.tagline, a.description, ...prompts].some((s) => s.toLowerCase().includes(q))
    })
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "prompts"
          ? promptChain(b.envelope).length - promptChain(a.envelope).length
          : b.published_at.localeCompare(a.published_at)
    )
  }, [apps, category, query, sort])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Browse</h1>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <InputGroup className="md:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            placeholder="Search apps and prompts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <Select items={SORTS} value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
          <SelectTrigger className="md:ml-auto" size="sm" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <Button key={c} size="sm" variant={c === category ? "default" : "outline"} onClick={() => setCategory(c)}>
            {c}
          </Button>
        ))}
      </div>

      {error && (
        <Alert>
          <AlertTitle>Some listings could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <AppCard key={a.id} app={a} />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No apps found</EmptyTitle>
            <EmptyDescription>Try another search or clear the filters.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("")
                setCategory("All")
              }}
            >
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  )
}
