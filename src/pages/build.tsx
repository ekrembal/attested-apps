import * as React from "react"
import { CircleX, Download, ExternalLink, Hammer, KeyRound, Puzzle, Send, X } from "lucide-react"
import { toast } from "sonner"

import { AppIcon } from "@/components/app-icon"
import { SettingsDialog } from "@/components/settings-dialog"
import { uploadToPinata } from "@/lib/pinata"
import { settings } from "@/lib/settings"
import { CopyButton } from "@/components/copy-button"
import { VerifyBadge } from "@/components/verify-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type BuildDetail, type BuildStatus, type BuildSummary } from "@/lib/api"
import { CONTRACT_TEXT, parseAppJson } from "@/lib/contract"
import { hasExtension, listingTemplate, publish, rootEnvelope } from "@/lib/nostr"
import { href, navigate } from "@/lib/router"
import { useSession } from "@/lib/session"
import { useStore } from "@/lib/store"
import { gatewayUrl } from "@/lib/types"
import { canonical, sha256 } from "@/lib/verify"

const ACTIVE: BuildStatus[] = ["queued", "running", "verifying"]
const STATUS: Record<BuildStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; progress: number }> = {
  queued: { label: "Queued", variant: "outline", progress: 10 },
  running: { label: "Building", variant: "secondary", progress: 50 },
  verifying: { label: "Verifying", variant: "secondary", progress: 90 },
  ready: { label: "Ready to publish", variant: "default", progress: 100 },
  failed: { label: "Failed", variant: "destructive", progress: 100 },
  rejected: { label: "Rejected", variant: "destructive", progress: 100 },
}

function SignInCard() {
  const { signIn, config } = useSession()
  const [busy, setBusy] = React.useState<null | "extension" | "local">(null)
  const go = async (kind: "extension" | "local") => {
    setBusy(kind)
    try {
      await signIn(kind)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in with Nostr</CardTitle>
        <CardDescription>
          Your key signs in and publishes your apps.
          {config?.allowlist && " Building is invite-only right now."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button onClick={() => go("extension")} disabled={!hasExtension() || !!busy}>
          {busy === "extension" ? <Spinner data-icon="inline-start" /> : <Puzzle data-icon="inline-start" />}
          Use Nostr extension
        </Button>
        <Button variant="outline" onClick={() => go("local")} disabled={!!busy}>
          {busy === "local" ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
          Use a key stored in this browser
        </Button>
      </CardContent>
    </Card>
  )
}

function NewBuildCard({ parentId, onCreated }: { parentId?: string; onCreated: () => void }) {
  const { quota, config, refresh } = useSession()
  const { apps } = useStore()
  const parent = parentId ? apps.find((a) => a.id === parentId) : undefined
  const [prompt, setPrompt] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const max = config?.maxPromptChars ?? 4000

  const submit = async () => {
    setSubmitting(true)
    try {
      await api.createBuild(prompt.trim(), parent?.envelope)
      setPrompt("")
      if (parent) navigate(href.build())
      onCreated()
      void refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{parent ? `Build on ${parent.name}` : "New app"}</CardTitle>
        {quota && (
          <CardAction>
            <Badge variant="outline">
              {quota.remaining}/{quota.limit} left today
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {parentId && (
          <Item variant="muted" size="sm">
            {parent ? (
              <>
                <ItemMedia>
                  <AppIcon name={parent.icon} className="size-8 rounded-lg" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{parent.name}</ItemTitle>
                  <ItemDescription>Your prompt is added to this app's prompt chain.</ItemDescription>
                </ItemContent>
              </>
            ) : (
              <ItemContent>
                <ItemDescription>That app is not in the store.</ItemDescription>
              </ItemContent>
            )}
            <ItemActions>
              <Button variant="ghost" size="icon-sm" aria-label="Start a new app instead" render={<a href={href.build()} />} nativeButton={false}>
                <X />
              </Button>
            </ItemActions>
          </Item>
        )}
        <Textarea
          className="min-h-32"
          placeholder={parent ? "What should change?" : "Describe the app you want, e.g. a water intake tracker called Sip Log with daily goals"}
          value={prompt}
          maxLength={max}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" />}>
            Instructions sent with your prompt
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{CONTRACT_TEXT.trim()}</pre>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {prompt.length}/{max}
        </span>
        <Button onClick={submit} disabled={submitting || prompt.trim().length < 10 || quota?.remaining === 0 || (!!parentId && !parent)}>
          {submitting ? <Spinner data-icon="inline-start" /> : <Hammer data-icon="inline-start" />}
          Build
        </Button>
      </CardFooter>
    </Card>
  )
}

function PublishPanel({
  build,
  onPublished,
}: {
  build: BuildDetail
  onPublished: () => void
}) {
  const { config, getSigner } = useSession()
  const { reload } = useStore()
  const [publishing, setPublishing] = React.useState(false)
  const [appId, setAppId] = React.useState<string | null>(null)
  const [upload, setUpload] = React.useState<
    { state: "idle" | "uploading" | "pinned" } | { state: "failed"; error: string }
  >({ state: "idle" })
  const meta = parseAppJson(build.appJson!)
  const envelope = build.envelope!
  const cid = envelope.statement.predicate.artifact.cid
  const pin = async () => {
    setUpload({ state: "uploading" })
    try {
      await uploadToPinata(
        await api.artifact(build.id),
        envelope,
        settings.pinata
      )
      setUpload({ state: "pinned" })
      toast.success("Pinned: CID matches the signed statement")
    } catch (e) {
      setUpload({ state: "failed", error: (e as Error).message })
      toast.error((e as Error).message)
    }
  }
  const download = async () => {
    try {
      const url = URL.createObjectURL(
        new Blob([await api.artifact(build.id)], { type: "application/gzip" })
      )
      const a = document.createElement("a")
      a.href = url
      a.download = `dist-${cid}.tar.gz`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  React.useEffect(() => {
    if (!build.publishedEventId) return
    getSigner()
      .then(async (s) =>
        setAppId(
          `${s.pubkey.slice(0, 8)}-${(await sha256(canonical(rootEnvelope(envelope).statement))).slice(0, 12)}`
        )
      )
      .catch(() => {})
  }, [build.publishedEventId, envelope, getSigner])

  const doPublish = async () => {
    setPublishing(true)
    try {
      const signer = await getSigner()
      const event = await signer.sign(
        await listingTemplate(envelope, build.appJson!)
      )
      const { ok, total } = await publish(config?.relays ?? [], event)
      await api.markPublished(build.id, event.id)
      toast.success(`Published to ${ok} of ${total} relays`)
      reload()
      onPublished()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Item variant="outline">
        <ItemMedia>
          <AppIcon name={meta.icon} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {meta.name}
            <Badge variant="outline">{meta.category}</Badge>
          </ItemTitle>
          <ItemDescription>{meta.tagline}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <VerifyBadge result={build.verification} />
        </ItemActions>
      </Item>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={pin}
          disabled={upload.state === "uploading" || upload.state === "pinned"}
        >
          {upload.state === "uploading"
            ? "Uploading…"
            : upload.state === "pinned"
              ? "Pinned ✓"
              : "Upload to IPFS (Pinata)"}
        </Button>
        {build.publishedEventId ? (
          <Button
            variant="secondary"
            render={<a href={appId ? href.app(appId) : href.browse()} />}
            nativeButton={false}
          >
            View in store
          </Button>
        ) : (
          <Button
            onClick={doPublish}
            disabled={publishing || upload.state !== "pinned"}
          >
            {publishing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Publish to Nostr
          </Button>
        )}
        <Button variant="outline" onClick={download}>
          <Download data-icon="inline-start" />
          dist.tar.gz
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                render={
                  <a href={gatewayUrl(cid)} target="_blank" rel="noreferrer" />
                }
                nativeButton={false}
              />
            }
          >
            IPFS <ExternalLink data-icon="inline-end" />
          </TooltipTrigger>
          <TooltipContent>Loads once the CID is pinned</TooltipContent>
        </Tooltip>
      </div>
      {upload.state === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>{upload.error}</AlertDescription>
        </Alert>
      )}
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
            />
          }
        >
          Pin on IPFS manually
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex items-start gap-1 rounded-lg bg-muted p-3">
            <pre className="flex-1 font-mono text-xs whitespace-pre-wrap">
              {`tar xzf dist-*.tar.gz\nipfs add -r --cid-version=1 --pin dist\n# last line must be: ${cid}`}
            </pre>
            <CopyButton
              value="ipfs add -r --cid-version=1 --pin dist"
              label="Copy command"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Download, extract and pin dist/ yourself. Confirm your IPFS tool
            returns exactly the signed CID before publishing.
          </p>
          <Button
            variant="outline"
            disabled={upload.state === "uploading"}
            onClick={() => {
              setUpload({ state: "pinned" })
            }}
          >
            I pinned manually and verified the signed CID
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function BuildCard({ summary, onChange }: { summary: BuildSummary; onChange: () => void }) {
  const [detail, setDetail] = React.useState<BuildDetail | null>(null)
  const [showLog, setShowLog] = React.useState(ACTIVE.includes(summary.status))
  const status = detail?.status ?? summary.status
  const s = STATUS[status]
  const logRef = React.useRef<HTMLPreElement>(null)

  React.useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const d = await api.build(summary.id)
        if (stop) return
        setDetail(d)
        if (d.status !== summary.status || d.publishedEventId !== summary.publishedEventId) onChange()
        if (ACTIVE.includes(d.status)) timer = setTimeout(tick, 2000)
      } catch {
        if (!stop) timer = setTimeout(tick, 5000)
      }
    }
    void tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [summary.id, summary.status, summary.publishedEventId, onChange])

  React.useEffect(() => {
    // Scroll only the log viewport, not the page.
    const viewport = logRef.current?.closest("[data-slot=scroll-area-viewport]")
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [detail?.logs])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="line-clamp-1">{summary.prompt}</CardTitle>
        <CardDescription>
          {new Date(summary.createdAt).toLocaleString()}
          {summary.hasParent && " · follow-up"}
          {status === "queued" && summary.queuePosition ? ` · #${summary.queuePosition} in queue` : ""}
        </CardDescription>
        <CardAction className="flex items-center gap-1.5">
          {summary.publishedEventId ? (
            <Badge variant="secondary">Published</Badge>
          ) : (
            <Badge variant={s.variant}>
              {ACTIVE.includes(status) && <Spinner />}
              {s.label}
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ACTIVE.includes(status) && <Progress value={s.progress} />}
        {(status === "failed" || status === "rejected") && (detail?.error ?? summary.error) && (
          <Alert variant="destructive">
            <CircleX />
            <AlertTitle>{status === "rejected" ? "Not publishable" : "Build failed"}</AlertTitle>
            <AlertDescription>{detail?.error ?? summary.error}</AlertDescription>
          </Alert>
        )}
        {status === "ready" && detail?.envelope && detail.appJson && <PublishPanel build={detail} onPublished={onChange} />}
        <Collapsible open={showLog} onOpenChange={setShowLog}>
          <CollapsibleTrigger render={<Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" />}>
            {showLog ? "Hide log" : "Show log"}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="my-2" />
            <ScrollArea className="h-48 rounded-lg bg-muted">
              <pre ref={logRef} className="p-3 font-mono text-xs whitespace-pre-wrap">
                {detail?.logs || "Waiting for the build to start…"}
              </pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

export function BuildPage({ parentId }: { parentId?: string }) {
  const { pubkey, ready, config } = useSession()
  const [loaded, setLoaded] = React.useState<{ pubkey: string; builds: BuildSummary[] } | null>(null)
  const builds = loaded && loaded.pubkey === pubkey ? loaded.builds : null

  const load = React.useCallback(() => {
    if (!pubkey) return
    api
      .builds()
      .catch(() => [])
      .then((list) => setLoaded({ pubkey, builds: list }))
  }, [pubkey])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Build</h1>
      {!ready ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : !config ? (
        <Alert variant="destructive">
          <CircleX />
          <AlertTitle>Configure your build server</AlertTitle>
          <AlertDescription>Open Settings and set BACKEND_URL to your store server, or run it on this origin. Check its CORS_ORIGIN. <SettingsDialog /></AlertDescription>
        </Alert>
      ) : !pubkey ? (
        <SignInCard />
      ) : (
        <>
          <NewBuildCard parentId={parentId} onCreated={load} />
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-medium">Your builds</h2>
            {builds === null ? (
              <Spinner />
            ) : builds.length ? (
              builds.map((b) => <BuildCard key={b.id} summary={b} onChange={load} />)
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Hammer />
                  </EmptyMedia>
                  <EmptyTitle>No builds yet</EmptyTitle>
                  <EmptyDescription>Describe an app above to start.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </>
      )}
    </div>
  )
}
