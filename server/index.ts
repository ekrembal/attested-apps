// Attested Apps store server.
// - Keeps the tinfoil-experiments bearer token away from browsers.
// - Access control: optional pubkey allowlist, per-pubkey and per-IP daily build quotas,
//   one active build per user, bounded queue in front of the one-job-at-a-time harness.
// - Verifies every finished build before it can be published.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { getConnInfo } from "@hono/node-server/conninfo"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { deleteCookie, getCookie } from "hono/cookie"
import { nip19, verifyEvent, type Event } from "nostr-tools"
import * as tar from "tar"

import { parseAppJson, wrapPrompt } from "../src/lib/contract.ts"
import type { Envelope } from "../src/lib/types.ts"
import { canonical, sha256, verifyEnvelope, type VerifyResult } from "../src/lib/verify.ts"

const env = process.env
const toHex = (k: string) => (k.startsWith("npub") ? (nip19.decode(k).data as string) : k.toLowerCase())
const cfg = {
  port: Number(env.PORT ?? 8787),
  jobsUrl: (env.JOBS_URL ?? "").replace(/\/$/, ""),
  jobsToken: env.JOBS_BEARER_TOKEN ?? "",
  allowlist: new Set((env.ALLOWED_PUBKEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(toHex)),
  buildsPerDay: Number(env.BUILDS_PER_DAY ?? 5),
  buildsPerIpPerDay: Number(env.BUILDS_PER_IP_PER_DAY ?? 10),
  maxQueue: Number(env.MAX_QUEUE ?? 10),
  maxPromptChars: Number(env.MAX_PROMPT_CHARS ?? 4000),
  jobTimeoutMs: Number(env.JOB_TIMEOUT_SECONDS ?? 1200) * 1000,
  allowDev: env.ALLOW_DEV_STATEMENTS === "1",
  trustProxy: env.TRUST_PROXY === "1",
  relays: (env.RELAYS ?? "wss://relay.damus.io,wss://relay.primal.net,wss://relay.snort.social,wss://nostr.oxtr.dev,wss://relay.nostr.net,wss://nos.lol").split(",").map((s) => s.trim()).filter(Boolean),
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString("hex"),
  publicOrigin: env.PUBLIC_ORIGIN?.replace(/\/$/, ""),
  // Frontend origin when it is hosted elsewhere (e.g. https://ekrembal.github.io).
  corsOrigins: (env.CORS_ORIGIN ?? "https://ekrembal.com").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean),
}
if (!cfg.jobsUrl || cfg.jobsToken.length < 16) {
  console.error("Set JOBS_URL and JOBS_BEARER_TOKEN (16+ chars) for the tinfoil-experiments jobs API.")
  process.exit(1)
}

type Status = "queued" | "running" | "verifying" | "ready" | "failed" | "rejected"
type Build = {
  id: string
  pubkey: string
  ip: string
  prompt: string
  parent?: Envelope
  status: Status
  jobId?: string
  logs: string
  error?: string
  createdAt: number
  updatedAt: number
  envelope?: Envelope
  appJson?: string
  verification?: VerifyResult
  artifact?: Buffer
  publishedEventId?: string
}
const builds = new Map<string, Build>()
const DAY = 86_400_000
const ACTIVE: Status[] = ["queued", "running", "verifying"]

// ---------- sessions ----------
const SESSION_TTL = 7 * DAY
const hmac = (s: string) => createHmac("sha256", cfg.sessionSecret).update(s).digest("hex")
function sessionPubkey(c: Context): string | null {
  const authorization = c.req.header("authorization")
  const token = authorization === undefined ? getCookie(c, "session") ?? "" : authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  const parts = token.split(".")
  const [pubkey, exp, sig] = parts
  if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(pubkey) || !/^\d+$/.test(exp) || !sig || !Number.isSafeInteger(Number(exp)) || Number(exp) <= Date.now()) return null
  const want = Buffer.from(hmac(`${pubkey}.${exp}`))
  if (want.length !== sig.length || !timingSafeEqual(want, Buffer.from(sig))) return null
  if (cfg.allowlist.size && !cfg.allowlist.has(pubkey)) return null
  return pubkey
}
const usedLoginEvents = new Map<string, number>()

function clientIp(c: Context) {
  if (cfg.trustProxy) {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (fwd) return fwd
  }
  return getConnInfo(c).remote.address ?? "unknown"
}

function quota(pubkey: string) {
  const since = Date.now() - DAY
  const used = [...builds.values()].filter((b) => b.pubkey === pubkey && b.createdAt > since).length
  return { used, limit: cfg.buildsPerDay, remaining: Math.max(0, cfg.buildsPerDay - used) }
}

const summary = (b: Build) => ({
  id: b.id,
  prompt: b.prompt,
  status: b.status,
  error: b.error,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
  hasParent: !!b.parent,
  publishedEventId: b.publishedEventId,
  queuePosition: b.status === "queued" ? [...builds.values()].filter((x) => x.status === "queued" && x.createdAt <= b.createdAt).length : undefined,
})
const detail = (b: Build) => ({
  ...summary(b),
  logs: b.logs,
  envelope: b.envelope,
  appJson: b.appJson,
  verification: b.verification,
})

// ---------- harness worker ----------
const harness = (path: string, init?: RequestInit) =>
  fetch(cfg.jobsUrl + path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${cfg.jobsToken}` } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let working = false

async function pump() {
  if (working) return
  const next = [...builds.values()].filter((b) => b.status === "queued").sort((a, b) => a.createdAt - b.createdAt)[0]
  if (!next) return
  working = true
  try {
    await runBuild(next)
  } catch (e) {
    finish(next, "failed", (e as Error).message)
  } finally {
    working = false
    setImmediate(pump)
  }
}

function finish(b: Build, status: Status, error?: string) {
  b.status = status
  b.error = error
  b.updatedAt = Date.now()
  if (error) b.logs += `\n${status.toUpperCase()}: ${error}\n`
}

async function runBuild(b: Build) {
  const prompt = wrapPrompt(b.prompt)
  for (;;) {
    const res = await harness("/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, ...(b.parent ? { parent_statement: b.parent } : {}) }),
    })
    if (res.status === 409) {
      await sleep(5000) // harness busy with someone else's job
      continue
    }
    if (!res.ok) return finish(b, "failed", `Harness rejected the job (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`)
    b.jobId = ((await res.json()) as { id: string }).id
    break
  }
  b.status = "running"
  b.updatedAt = Date.now()
  const deadline = Date.now() + cfg.jobTimeoutMs
  for (;;) {
    if (Date.now() > deadline) return finish(b, "failed", "Timed out waiting for the harness")
    const job = (await (await harness(`/jobs/${b.jobId}`)).json()) as { status: string; logs: string }
    b.logs = String(job.logs ?? "").slice(-64 * 1024)
    b.updatedAt = Date.now()
    if (job.status === "failed") return finish(b, "failed", "The build job failed")
    if (job.status === "completed") break
    await sleep(2000)
  }

  b.status = "verifying"
  const envelope = (await (await harness(`/jobs/${b.jobId}/statement`)).json()) as Envelope
  const artifact = Buffer.from(await (await harness(`/jobs/${b.jobId}/artifact`)).arrayBuffer())
  b.envelope = envelope
  b.artifact = artifact

  const p = envelope.statement?.predicate
  if (p?.prompt !== prompt) return finish(b, "rejected", "Signed prompt differs from the submitted prompt")
  if (b.parent && p.parent_statement_sha256 !== (await sha256(canonical(b.parent.statement))))
    return finish(b, "rejected", "Build is not linked to the requested parent")
  if (envelope.statement.subject?.[0]?.digest?.sha256 !== createHashHex(artifact))
    return finish(b, "rejected", "Artifact does not match the signed digest")

  const appJson = await readTarFile(artifact, "dist/app.json")
  if (appJson === null) return finish(b, "rejected", "The agent did not write public/app.json, so there is nothing to list")
  try {
    parseAppJson(appJson)
  } catch (e) {
    return finish(b, "rejected", (e as Error).message)
  }
  b.appJson = appJson
  b.verification = await verifyEnvelope(envelope, appJson)
  if (b.verification.overall === "failed") return finish(b, "rejected", "Statement failed verification")
  if (b.verification.overall === "dev" && !cfg.allowDev) return finish(b, "rejected", "Development builds are not accepted")
  b.logs += "\nverified: ready to publish\n"
  finish(b, "ready")
}

const createHashHex = (buf: Buffer) => createHash("sha256").update(buf).digest("hex")

async function readTarFile(buf: Buffer, name: string): Promise<string | null> {
  let found: string | null = null
  await new Promise<void>((resolve, reject) => {
    const parser = new tar.Parser({
      onReadEntry: (entry) => {
        if (entry.path.replace(/^\.\//, "") !== name) return entry.resume()
        const chunks: Buffer[] = []
        entry.on("data", (c: Buffer) => chunks.push(c))
        entry.on("end", () => (found = Buffer.concat(chunks).toString("utf8")))
      },
    })
    parser.on("end", () => resolve())
    parser.on("error", reject)
    parser.end(buf)
  })
  return found
}

// ---------- routes ----------
const app = new Hono()
app.use("/api/*", bodyLimit({ maxSize: 2 * 1024 * 1024 }))
app.use("/api/*", cors({ origin: cfg.corsOrigins.includes("*") ? "*" : cfg.corsOrigins, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "OPTIONS"] }))

app.get("/api/config", (c) =>
  c.json({
    relays: cfg.relays,
    allowlist: cfg.allowlist.size > 0,
    buildsPerDay: cfg.buildsPerDay,
    maxPromptChars: cfg.maxPromptChars,
    allowDev: cfg.allowDev,
  })
)

app.post("/api/auth/login", async (c) => {
  const { event } = (await c.req.json().catch(() => ({}))) as { event?: Event }
  const now = Math.floor(Date.now() / 1000)
  const tag = (k: string) => event?.tags?.find((t) => t[0] === k)?.[1]
  const u = tag("u") ?? ""
  const okUrl = cfg.publicOrigin ? u === `${cfg.publicOrigin}/api/auth/login` : u.endsWith("/api/auth/login")
  if (!event || event.kind !== 27235 || !verifyEvent(event) || Math.abs(now - event.created_at) > 60 || !okUrl || tag("method") !== "POST")
    return c.json({ error: "Invalid login event" }, 400)
  for (const [id, t] of usedLoginEvents) if (t < Date.now() - 120_000) usedLoginEvents.delete(id)
  if (usedLoginEvents.has(event.id)) return c.json({ error: "Login event already used" }, 400)
  usedLoginEvents.set(event.id, Date.now())
  if (cfg.allowlist.size && !cfg.allowlist.has(event.pubkey))
    return c.json({ error: "This key is not on the builder allowlist" }, 403)
  const exp = Date.now() + SESSION_TTL
  const token = `${event.pubkey}.${exp}.${hmac(`${event.pubkey}.${exp}`)}`
  c.header("Cache-Control", "no-store")
  return c.json({ pubkey: event.pubkey, token })
})

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, "session", { path: "/" })
  return c.json({ ok: true })
})

app.get("/api/me", (c) => {
  const pubkey = sessionPubkey(c)
  if (!pubkey) return c.json({ error: "Not signed in" }, 401)
  return c.json({ pubkey, quota: quota(pubkey) })
})

app.post("/api/builds", async (c) => {
  const pubkey = sessionPubkey(c)
  if (!pubkey) return c.json({ error: "Sign in to build" }, 401)
  const { prompt, parent } = (await c.req.json().catch(() => ({}))) as { prompt?: unknown; parent?: Envelope }
  if (typeof prompt !== "string" || prompt.trim().length < 10) return c.json({ error: "Describe the app in at least 10 characters" }, 400)
  if (prompt.length > cfg.maxPromptChars) return c.json({ error: `Prompt is longer than ${cfg.maxPromptChars} characters` }, 400)
  if (parent !== undefined) {
    const r = await verifyEnvelope(parent).catch(() => null)
    if (!r || r.overall === "failed") return c.json({ error: "The app you are building on does not verify" }, 400)
    if (r.overall === "dev" && !cfg.allowDev) return c.json({ error: "Cannot build on a development build" }, 400)
  }
  const mine = [...builds.values()].filter((b) => b.pubkey === pubkey)
  if (mine.some((b) => ACTIVE.includes(b.status))) return c.json({ error: "You already have a build in progress" }, 429)
  if (quota(pubkey).remaining <= 0) return c.json({ error: `Daily limit of ${cfg.buildsPerDay} builds reached` }, 429)
  const ip = clientIp(c)
  if ([...builds.values()].filter((b) => b.ip === ip && b.createdAt > Date.now() - DAY).length >= cfg.buildsPerIpPerDay)
    return c.json({ error: "Too many builds from this network today" }, 429)
  if ([...builds.values()].filter((b) => b.status === "queued").length >= cfg.maxQueue)
    return c.json({ error: "The build queue is full, try again later" }, 503)

  const b: Build = { id: randomUUID(), pubkey, ip, prompt, parent, status: "queued", logs: "", createdAt: Date.now(), updatedAt: Date.now() }
  builds.set(b.id, b)
  void pump()
  return c.json(summary(b), 201)
})

app.get("/api/builds", (c) => {
  const pubkey = sessionPubkey(c)
  if (!pubkey) return c.json({ error: "Not signed in" }, 401)
  return c.json([...builds.values()].filter((b) => b.pubkey === pubkey).sort((a, b) => b.createdAt - a.createdAt).map(summary))
})

const owned = (c: Context) => {
  const pubkey = sessionPubkey(c)
  const b = builds.get(c.req.param("id") ?? "")
  return pubkey && b && b.pubkey === pubkey ? b : null
}
app.get("/api/builds/:id", (c) => {
  const b = owned(c)
  return b ? c.json(detail(b)) : c.json({ error: "Not found" }, 404)
})
app.get("/api/builds/:id/artifact", (c) => {
  const b = owned(c)
  if (!b?.artifact) return c.json({ error: "Not found" }, 404)
  return c.body(new Uint8Array(b.artifact), 200, {
    "content-type": "application/gzip",
    "content-disposition": `attachment; filename="dist-${b.envelope?.statement.predicate.artifact.cid.slice(0, 16)}.tar.gz"`,
  })
})
app.post("/api/builds/:id/published", async (c) => {
  const b = owned(c)
  if (!b || b.status !== "ready") return c.json({ error: "Not found" }, 404)
  const { eventId } = (await c.req.json().catch(() => ({}))) as { eventId?: string }
  if (typeof eventId !== "string" || !/^[0-9a-f]{64}$/.test(eventId)) return c.json({ error: "Bad event id" }, 400)
  b.publishedEventId = eventId
  return c.json(summary(b))
})

// Serve the built frontend in production.
if (existsSync("dist/index.html")) {
  app.use("/*", serveStatic({ root: "./dist" }))
  app.get("*", serveStatic({ path: "./dist/index.html" }))
}

serve({ fetch: app.fetch, port: cfg.port, hostname: env.HOST ?? "127.0.0.1" }, ({ port }) => {
  console.log(
    `store server on :${port} -> ${cfg.jobsUrl}` +
      ` (allowlist: ${cfg.allowlist.size || "off"}, ${cfg.buildsPerDay}/day per user, dev builds: ${cfg.allowDev ? "allowed" : "rejected"})`
  )
})
