import * as React from "react"
import { ArrowLeft, Bot, Download, ExternalLink, FileCode, GitBranchPlus, ShieldCheck, TriangleAlert } from "lucide-react"

import { AppIcon } from "@/components/app-icon"
import { CopyButton, HashValue } from "@/components/copy-button"
import { CheckIcon, STATUS_LABEL, VerifyBadge } from "@/components/verify-badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { splitPrompt } from "@/lib/contract"
import { formatBytes, formatDate } from "@/lib/format"
import { shortNpub } from "@/lib/nostr"
import { href, navigate } from "@/lib/router"
import { useStore } from "@/lib/store"
import { gatewayUrl, promptChain, type Envelope, type StoreApp } from "@/lib/types"
import type { VerifyResult } from "@/lib/verify"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="w-48 align-top text-muted-foreground">{label}</TableCell>
      <TableCell className="max-w-0 whitespace-normal">{children}</TableCell>
    </TableRow>
  )
}

function OverviewTab({ app, result }: { app: StoreApp; result?: VerifyResult }) {
  const p = app.envelope.statement.predicate
  const chain = promptChain(app.envelope)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>{app.description}</p>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Latest prompt</p>
            <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap text-muted-foreground italic">
              {splitPrompt(p.prompt).user}
            </blockquote>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Build facts</CardTitle>
          <CardAction>
            <VerifyBadge result={result} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground">Prompts</TableCell>
                <TableCell className="text-right">{chain.length}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Model</TableCell>
                <TableCell className="text-right font-mono text-xs">{p.model}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Agent</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.agent ? `${p.agent.name} ${p.agent.version}` : "unknown"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Mode</TableCell>
                <TableCell className="text-right">
                  <Badge variant={p.mode === "tinfoil" ? "default" : "outline"}>{p.mode}</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Files</TableCell>
                <TableCell className="text-right">{p.artifact.manifest.length}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Size</TableCell>
                <TableCell className="text-right">
                  {formatBytes(p.artifact.manifest.reduce((n, f) => n + f.size, 0))}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Published</TableCell>
                <TableCell className="text-right">{formatDate(app.published_at)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function PromptsTab({ app, result }: { app: StoreApp; result?: VerifyResult }) {
  const chain = promptChain(app.envelope)
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {chain.map((env, i) => {
          const p = env.statement.predicate
          const { contract, user } = splitPrompt(p.prompt)
          const level = result?.levels[i]
          const failing = level?.checks.filter((c) => c.status === "fail") ?? []
          return (
            <li key={p.prompt_sha256 + i}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      #{i + 1}
                    </Badge>
                    {i === 0 ? "Initial prompt" : `Follow-up ${i}`}
                    {i === chain.length - 1 && <Badge variant="outline">current build</Badge>}
                  </CardTitle>
                  <CardAction className="flex items-center gap-1">
                    {level &&
                      (failing.length ? (
                        <Badge variant="destructive">{failing.map((c) => c.label).join(", ")} failed</Badge>
                      ) : (
                        <Badge variant="outline">
                          <ShieldCheck />
                          Signed
                        </Badge>
                      ))}
                    <CopyButton value={user} label="Copy prompt" />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <pre className="rounded-lg bg-muted p-3 font-sans text-sm whitespace-pre-wrap">{user}</pre>
                  {contract && (
                    <Collapsible>
                      <CollapsibleTrigger render={<Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" />}>
                        + store build instructions (also signed)
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{contract}</pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Bot className="size-3.5" />
                      {p.model}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      prompt sha256 <HashValue value={p.prompt_sha256} />
                    </span>
                    {level && (
                      <span className="inline-flex items-center gap-1">
                        statement <HashValue value={level.statementSha256} />
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FilesTab({ app }: { app: StoreApp }) {
  const { manifest, cid } = app.envelope.statement.predicate.artifact
  const subject = app.envelope.statement.subject[0]
  return (
    <div className="flex flex-col gap-4">
      <ItemGroup className="grid gap-3 md:grid-cols-2">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>UnixFS CIDv1 of dist/</ItemTitle>
            <ItemDescription className="font-mono break-all">{cid}</ItemDescription>
          </ItemContent>
          <CopyButton value={cid} label="Copy CID" />
        </Item>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>{subject?.name ?? "artifact"} sha256</ItemTitle>
            <ItemDescription className="font-mono break-all">{subject?.digest.sha256}</ItemDescription>
          </ItemContent>
          {subject && <CopyButton value={subject.digest.sha256} label="Copy digest" />}
        </Item>
      </ItemGroup>
      <Card size="sm">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>SHA-256</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manifest.map((f) => (
                <TableRow key={f.path}>
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <FileCode className="size-3.5 text-muted-foreground" />
                      {f.path}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(f.size)}</TableCell>
                  <TableCell>
                    <HashValue value={f.sha256} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{manifest.length} files</TableCell>
                <TableCell className="text-right">{formatBytes(manifest.reduce((n, f) => n + f.size, 0))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatementDetails({ env }: { env: Envelope }) {
  const p = env.statement.predicate
  return (
    <Table>
      <TableBody>
        <Field label="Statement type">
          <code className="text-xs break-all">{env.statement._type}</code>
        </Field>
        <Field label="Predicate type">
          <code className="text-xs break-all">{env.statement.predicateType}</code>
        </Field>
        <Field label="Config repository">
          <a className="underline underline-offset-4" href={`https://github.com/${p.config.repo}`} target="_blank" rel="noreferrer">
            {p.config.repo}
          </a>
        </Field>
        <Field label="Harness image">
          <HashValue value={p.harness_image_digest} />
        </Field>
        <Field label="Attestation type">
          <Badge variant={env.attestation.type === "tinfoil/v3" ? "default" : "outline"}>{env.attestation.type}</Badge>
        </Field>
        <Field label="Parent statement">
          {p.parent_statement_sha256 ? <HashValue value={p.parent_statement_sha256} /> : <span className="text-muted-foreground">none (root)</span>}
        </Field>
        {p.transcript && (
          <Field label="Transcript">
            <span className="inline-flex items-center gap-2">
              <code className="text-xs">{p.transcript.name}</code>
              <HashValue value={p.transcript.sha256} />
            </span>
          </Field>
        )}
        <Field label="Signature (Ed25519)">
          <HashValue value={env.signature} />
        </Field>
        <Field label="Public key">
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="link" size="sm" className="h-auto p-0" />}>Show PEM</CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{env.public_key}</pre>
            </CollapsibleContent>
          </Collapsible>
        </Field>
      </TableBody>
    </Table>
  )
}

function AttestationTab({ app, result }: { app: StoreApp; result?: VerifyResult }) {
  const chain = promptChain(app.envelope)
  const json = React.useMemo(() => JSON.stringify(app.envelope, null, 2), [app.envelope])

  return (
    <div className="flex flex-col gap-4">
      {result?.overall === "dev" && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Development build</AlertTitle>
          <AlertDescription>No enclave quote: tamper-evident, but it does not prove who built it.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
          <CardDescription>Checked in your browser.</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Checking…
            </div>
          ) : (
            <Accordion defaultValue={[`level-${result.levels.length - 1}`]}>
              {result.levels.map((level, i) => {
                const fails = level.checks.filter((c) => c.status === "fail").length
                return (
                  <AccordionItem key={i} value={`level-${i}`}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          #{i + 1}
                        </Badge>
                        <span className="line-clamp-1 text-left">{splitPrompt(chain[i]?.statement.predicate.prompt ?? "").user}</span>
                        {fails > 0 && <Badge variant="destructive">{fails} failed</Badge>}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ItemGroup className="gap-1">
                        {level.checks.map((c) => (
                          <Item key={c.id} size="xs">
                            <ItemMedia variant="icon">
                              <CheckIcon status={c.status} />
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>{c.label}</ItemTitle>
                              <ItemDescription>{c.detail}</ItemDescription>
                            </ItemContent>
                            <Badge variant={c.status === "fail" ? "destructive" : "outline"}>{STATUS_LABEL[c.status]}</Badge>
                          </Item>
                        ))}
                      </ItemGroup>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current statement</CardTitle>
        </CardHeader>
        <CardContent>
          <StatementDetails env={app.envelope} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw envelope</CardTitle>
          <CardAction className="flex gap-1">
            <CopyButton value={json} label="Copy JSON" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Download statement.json"
                    onClick={() => {
                      const a = document.createElement("a")
                      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }))
                      a.download = `${app.id}.statement.json`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                  />
                }
              >
                <Download />
              </TooltipTrigger>
              <TooltipContent>Download statement.json</TooltipContent>
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            node verifier/cli.mjs {app.id}.statement.json artifact.tar.gz --repo {app.envelope.statement.predicate.config.repo}
            {app.envelope.attestation.type === "dev/none" ? " --allow-dev" : ""}
          </pre>
          <ScrollArea className="h-80 rounded-lg border">
            <pre className="p-3 font-mono text-xs">{json}</pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

const TABS = ["overview", "prompts", "files", "attestation"] as const

export function AppDetailPage({ id, tab }: { id: string; tab: string }) {
  const { apps, loading, results } = useStore()
  const app = apps.find((a) => a.id === id)
  const result = results[id]

  if (loading)
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6" />
      </div>
    )

  if (!app)
    return (
      <Empty className="mx-auto my-16 max-w-md border">
        <EmptyHeader>
          <EmptyTitle>App not found</EmptyTitle>
          <EmptyDescription>It may have been removed or failed verification.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" render={<a href={href.browse()} />} nativeButton={false}>
            <ArrowLeft data-icon="inline-start" /> Back to apps
          </Button>
        </EmptyContent>
      </Empty>
    )

  const current = (TABS as readonly string[]).includes(tab) ? tab : "overview"
  const chain = promptChain(app.envelope)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={href.browse()}>Apps</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={href.browse()}>{app.category}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{app.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AppIcon name={app.icon} className="size-20 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{app.name}</h1>
          <p className="text-muted-foreground">{app.tagline}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <VerifyBadge result={result} />
            <Badge variant="secondary">
              {chain.length} {chain.length === 1 ? "prompt" : "prompts"}
            </Badge>
            <Badge variant="outline">{app.category}</Badge>
            {app.pubkey && (
              <Badge variant="outline" className="font-mono">
                by {shortNpub(app.pubkey)}
              </Badge>
            )}
            {app.source === "sample" && <Badge variant="outline">Sample</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(href.app(app.id, "attestation"))}>
            <ShieldCheck data-icon="inline-start" />
            Verify
          </Button>
          <Button variant="outline" render={<a href={href.build(app.id)} />} nativeButton={false}>
            <GitBranchPlus data-icon="inline-start" />
            Build on this
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  render={<a href={gatewayUrl(app.envelope.statement.predicate.artifact.cid)} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                />
              }
            >
              Open <ExternalLink data-icon="inline-end" />
            </TooltipTrigger>
            <TooltipContent>Opens the CID on an IPFS gateway. Loads once someone has pinned it.</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Tabs value={current} onValueChange={(v) => navigate(href.app(app.id, String(v)))}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prompts">Prompts ({chain.length})</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="attestation">Attestation</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <OverviewTab app={app} result={result} />
        </TabsContent>
        <TabsContent value="prompts" className="pt-4">
          <PromptsTab app={app} result={result} />
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <FilesTab app={app} />
        </TabsContent>
        <TabsContent value="attestation" className="pt-4">
          <AttestationTab app={app} result={result} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
