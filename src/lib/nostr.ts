import { finalizeEvent, generateSecretKey, getPublicKey, nip19, SimplePool, type Event, type EventTemplate } from "nostr-tools"

import { parseAppJson } from "./contract"
import type { Envelope, StoreApp } from "./types"
import { canonical, sha256 } from "./verify"

// Listings are addressable NIP-78 events. `d` is the hash of the first statement in the
// prompt chain, so a follow-up build replaces the listing of the same app.
export const LISTING_KIND = 30078
export const LISTING_TAG = "attested-app"
/** Used for browsing when no store server is reachable (e.g. the static GitHub Pages build). */
export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"]

export type Signer = {
  kind: "extension" | "local"
  pubkey: string
  sign: (e: EventTemplate) => Promise<Event>
}

type Nip07 = { getPublicKey(): Promise<string>; signEvent(e: EventTemplate): Promise<Event> }
const nip07 = () => (window as unknown as { nostr?: Nip07 }).nostr

export const hasExtension = () => !!nip07()

export async function extensionSigner(): Promise<Signer> {
  const ext = nip07()
  if (!ext) throw new Error("No Nostr extension found")
  const pubkey = await ext.getPublicKey()
  return { kind: "extension", pubkey, sign: (e) => ext.signEvent(e) }
}

const LOCAL_KEY = "attested-store:nsec"
export function localSigner(create: boolean): Signer | null {
  let nsec: string | null = null
  try {
    nsec = localStorage.getItem(LOCAL_KEY)
  } catch {
    /* storage blocked */
  }
  let sk: Uint8Array
  if (nsec) sk = nip19.decode(nsec as `nsec1${string}`).data as Uint8Array
  else if (create) {
    sk = generateSecretKey()
    try {
      localStorage.setItem(LOCAL_KEY, nip19.nsecEncode(sk))
    } catch {
      /* in-memory only */
    }
  } else return null
  return { kind: "local", pubkey: getPublicKey(sk), sign: async (e) => finalizeEvent(e, sk) }
}

export const npub = (hex: string) => nip19.npubEncode(hex)
export const shortNpub = (hex: string) => {
  const n = npub(hex)
  return `${n.slice(0, 10)}…${n.slice(-4)}`
}

export function rootEnvelope(e: Envelope) {
  while (e.parent) e = e.parent
  return e
}

export async function listingTemplate(envelope: Envelope, appJson: string): Promise<EventTemplate> {
  const meta = parseAppJson(appJson)
  const d = await sha256(canonical(rootEnvelope(envelope).statement))
  return {
    kind: LISTING_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", d],
      ["t", LISTING_TAG],
      ["title", meta.name],
      ["cid", envelope.statement.predicate.artifact.cid],
      ["x", await sha256(canonical(envelope.statement))],
      ["alt", `Attested app listing: ${meta.name}`],
    ],
    content: JSON.stringify({ v: 1, envelope, app_json: appJson }),
  }
}

const pool = new SimplePool()

export async function publish(relays: string[], event: Event) {
  const results = await Promise.allSettled(pool.publish(relays, event))
  const ok = results.filter((r) => r.status === "fulfilled").length
  if (!ok) throw new Error("No relay accepted the event")
  return { ok, total: relays.length }
}

/** Load listings from relays. Invalid content is dropped here; verification happens later. */
export async function fetchListings(relays: string[]): Promise<StoreApp[]> {
  const events = await pool.querySync(relays, { kinds: [LISTING_KIND], "#t": [LISTING_TAG], limit: 500 }, { maxWait: 5000 })
  const latest = new Map<string, Event>()
  for (const e of events) {
    const d = e.tags.find((t) => t[0] === "d")?.[1]
    if (!d) continue
    const key = `${e.pubkey}:${d}`
    if ((latest.get(key)?.created_at ?? 0) < e.created_at) latest.set(key, e)
  }
  const apps: StoreApp[] = []
  for (const [key, e] of latest) {
    try {
      const { envelope, app_json } = JSON.parse(e.content) as { envelope: Envelope; app_json: string }
      if (!envelope?.statement || typeof app_json !== "string") continue
      apps.push({
        ...parseAppJson(app_json),
        id: `${e.pubkey.slice(0, 8)}-${key.split(":")[1].slice(0, 12)}`,
        published_at: new Date(e.created_at * 1000).toISOString(),
        envelope,
        app_json,
        source: "nostr",
        pubkey: e.pubkey,
        event_id: e.id,
      })
    } catch {
      /* skip malformed listing */
    }
  }
  return apps
}
