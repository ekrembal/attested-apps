// Dev-only minimal Nostr relay (NIP-01 EVENT/REQ/CLOSE, addressable replacement), so local
// testing never publishes to public relays. Events persist to server/.data/relay.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { WebSocketServer } from "ws"
import { verifyEvent, type Event, type Filter } from "nostr-tools"

const FILE = new URL("../.data/relay.json", import.meta.url)

function matches(e: Event, f: Filter) {
  if (f.ids && !f.ids.includes(e.id)) return false
  if (f.kinds && !f.kinds.includes(e.kind)) return false
  if (f.authors && !f.authors.includes(e.pubkey)) return false
  if (f.since && e.created_at < f.since) return false
  if (f.until && e.created_at > f.until) return false
  for (const [k, vals] of Object.entries(f)) {
    if (!k.startsWith("#") || !Array.isArray(vals)) continue
    if (!e.tags.some((t) => t[0] === k.slice(1) && (vals as string[]).includes(t[1]))) return false
  }
  return true
}

export function startMockRelay(port: number) {
  let events: Event[] = []
  try {
    events = JSON.parse(readFileSync(FILE, "utf8"))
  } catch {
    /* fresh relay */
  }
  const save = () => {
    mkdirSync(new URL("../.data/", import.meta.url), { recursive: true })
    writeFileSync(FILE, JSON.stringify(events))
  }
  const wss = new WebSocketServer({ port, host: "127.0.0.1", maxPayload: 512 * 1024 })
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg: unknown[]
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg[0] === "EVENT") {
        const e = msg[1] as Event
        if (!verifyEvent(e)) return ws.send(JSON.stringify(["OK", e?.id, false, "invalid: bad signature"]))
        if (e.kind >= 30000 && e.kind < 40000) {
          const d = e.tags.find((t) => t[0] === "d")?.[1] ?? ""
          events = events.filter((x) => !(x.kind === e.kind && x.pubkey === e.pubkey && (x.tags.find((t) => t[0] === "d")?.[1] ?? "") === d))
        }
        events.push(e)
        save()
        ws.send(JSON.stringify(["OK", e.id, true, ""]))
      } else if (msg[0] === "REQ") {
        const [, sub, ...filters] = msg as [string, string, ...Filter[]]
        const out = events
          .filter((e) => filters.some((f) => matches(e, f)))
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, Math.max(...filters.map((f) => f.limit ?? 500)))
        for (const e of out) ws.send(JSON.stringify(["EVENT", sub, e]))
        ws.send(JSON.stringify(["EOSE", sub]))
      }
    })
  })
  return wss
}
