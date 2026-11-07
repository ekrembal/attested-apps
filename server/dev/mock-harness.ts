// Dev-only mock of the tinfoil-experiments jobs API (POST /jobs, GET /jobs/:id[/artifact|/statement|/log]).
// "Agent" behaviour: follows the publishing contract by writing app.json guessed from the prompt.
// Put "#fail" in a prompt to make the job fail, "#noappjson" to skip app.json.
import http from "node:http"
import { randomUUID, timingSafeEqual } from "node:crypto"

import { CATEGORIES, splitPrompt, type AppMeta } from "../../src/lib/contract.ts"
import type { Envelope } from "../../src/lib/types.ts"
import { fakeBuild } from "./fake-build.ts"

type Job = { id: string; status: "queued" | "running" | "completed" | "failed"; logs: string; envelope?: Envelope; tarball?: Buffer }

function guessMeta(userPrompt: string, parent?: Envelope): AppMeta {
  const named = userPrompt.match(/called\s+["“]?([A-Z]\w*(?:\s+[A-Z]\w*)*)/)
  const words = userPrompt.replace(/^(build|make|create|write)\s+(an?|the)?\s*/i, "").split(/\s+/).slice(0, 3)
  const name = (named?.[1] ?? words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ")).replace(/[^\w ]/g, "").slice(0, 30)
  const lower = userPrompt.toLowerCase()
  const category =
    [["Finance", /bill|money|budget|expense/], ["Health", /habit|health|fitness|water/], ["Games", /game|puzzle/], ["Social", /chat|nostr|social|peer/], ["AI", /llm|ai |ollama|model/], ["Productivity", /note|todo|timer|task/]]
      .find(([, re]) => (re as RegExp).test(lower))?.[0] as string | undefined
  const parentName = parent ? safeParentName(parent) : null
  return {
    name: parentName ?? (name || "Untitled App"),
    tagline: userPrompt.split(/[.\n]/)[0].slice(0, 80),
    description: userPrompt.slice(0, 400),
    category: category && (CATEGORIES as readonly string[]).includes(category) ? category : "Utilities",
    icon: "Sparkles",
  }
}
function safeParentName(parent: Envelope) {
  const m = splitPrompt(parent.statement.predicate.prompt).user.match(/called\s+["“]?([A-Z]\w*(?:\s+[A-Z]\w*)*)/)
  return m?.[1] ?? null
}

export function startMockHarness(port: number, token: string) {
  const jobs = new Map<string, Job>()
  let busy = false
  const json = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body))
  }
  const server = http.createServer(async (req, res) => {
    const got = Buffer.from(req.headers.authorization ?? "")
    const want = Buffer.from(`Bearer ${token}`)
    if (got.length !== want.length || !timingSafeEqual(got, want)) return json(res, 401, { error: "unauthorized" })
    const url = req.url ?? ""
    if (req.method === "POST" && url === "/jobs") {
      if (busy) return json(res, 409, { error: "one job at a time" })
      let body = ""
      for await (const chunk of req) body += chunk
      const { prompt, parent_statement } = JSON.parse(body || "{}") as { prompt?: string; parent_statement?: Envelope }
      if (typeof prompt !== "string" || !prompt) return json(res, 400, { error: "prompt required" })
      const job: Job = { id: randomUUID(), status: "queued", logs: "" }
      jobs.set(job.id, job)
      busy = true
      void run(job, prompt, parent_statement).finally(() => (busy = false))
      return json(res, 202, { id: job.id })
    }
    const m = url.match(/^\/jobs\/([0-9a-f-]{36})(?:\/(artifact|statement|log))?$/)
    const job = m && jobs.get(m[1])
    if (req.method !== "GET" || !job) return json(res, 404, { error: "not found" })
    if (!m[2]) return json(res, 200, { id: job.id, status: job.status, logs: job.logs })
    if (m[2] === "log") return res.writeHead(200, { "content-type": "application/x-ndjson" }).end(`{"type":"agent_end"}\n`)
    if (job.status !== "completed") return json(res, 409, { error: "not completed" })
    if (m[2] === "statement") return json(res, 200, job.envelope)
    res.writeHead(200, { "content-type": "application/gzip" }).end(job.tarball)
  })
  server.listen(port, "127.0.0.1")
  return server

  async function run(job: Job, prompt: string, parent?: Envelope) {
    const log = (s: string) => (job.logs += s + "\n")
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    job.status = "running"
    const { contract, user } = splitPrompt(prompt)
    log("copy offline starter")
    await wait(600)
    log("pnpm install --offline --frozen-lockfile")
    await wait(900)
    log("agent: pi 1.5.0 (mock inference)")
    for (const step of ["reading src/App.tsx", "writing src/App.tsx", "writing src/components/main.tsx"]) {
      await wait(700)
      log(`tool: ${step}`)
    }
    if (user.includes("#fail")) {
      log("ERROR: agent did not complete (mock failure)")
      job.status = "failed"
      return
    }
    const meta = contract && !user.includes("#noappjson") ? guessMeta(user, parent) : null
    if (meta) log("tool: writing public/app.json")
    await wait(600)
    log("pnpm build")
    const { envelope, tarball } = await fakeBuild({ prompt, userPrompt: user, parent, meta })
    job.envelope = envelope
    job.tarball = tarball
    log("job completed")
    job.status = "completed"
  }
}
