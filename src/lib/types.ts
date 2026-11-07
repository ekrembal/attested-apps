// Shapes produced by tinfoil-experiments (harness/server.mjs).
import type { AppMeta } from "./contract.ts"

export type FileEntry = { path: string; size: number; sha256: string }

export type Predicate = {
  mode: "dev" | "tinfoil"
  harness_image_digest: string
  config: { repo: string }
  model: string
  prompt: string
  prompt_sha256: string
  parent_statement_sha256: string | null
  artifact: { manifest: FileEntry[]; cid: string }
  inference_verification?: Record<string, unknown> & { transcript_sha256?: string }
  agent?: { name: string; package: string; version: string }
  transcript?: { name: string; sha256: string }
}

export type Statement = {
  _type: string
  subject: { name: string; digest: { sha256: string } }[]
  predicateType: string
  predicate: Predicate
}

export type Attestation =
  | { type: "dev/none" }
  | { type: "tinfoil/v3"; document: string }
  | { type: string; document?: string }

export type Envelope = {
  statement: Statement
  public_key: string
  signature: string
  attestation: Attestation
  parent?: Envelope
}

/** What gets published: the signed envelope plus the raw app.json from dist/. */
export type Listing = {
  envelope: Envelope
  app_json: string
}

export type StoreApp = AppMeta & {
  id: string
  published_at: string
  envelope: Envelope
  app_json: string
  source: "nostr" | "sample"
  pubkey?: string
  event_id?: string
}

/** Oldest prompt first. */
export function promptChain(envelope: Envelope): Envelope[] {
  const chain: Envelope[] = []
  for (let e: Envelope | undefined = envelope; e; e = e.parent) chain.unshift(e)
  return chain
}

export const gatewayUrl = (cid: string) => `https://${cid}.ipfs.dweb.link/`
