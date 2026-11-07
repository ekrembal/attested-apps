// Browser-side checks that mirror verifyEnvelope() in tinfoil-experiments/harness/provenance.mjs.
// Hardware quote (V3) verification and artifact/CID re-hashing are deferred for now.
import type { Envelope } from "./types.ts"

export type CheckStatus = "pass" | "fail" | "warn" | "deferred"
export type Check = { id: string; label: string; status: CheckStatus; detail: string }
export type LevelResult = { depth: number; statementSha256: string; checks: Check[] }
export type Overall = "verified" | "dev" | "partial" | "failed"
export type VerifyResult = { overall: Overall; levels: LevelResult[] }

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`
}

const enc = new TextEncoder()
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function sha256(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)))
}

async function verifyEd25519(pem: string, signature: string, message: string) {
  const der = b64(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""))
  const key = await crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"])
  return crypto.subtle.verify({ name: "Ed25519" }, key, b64(signature), enc.encode(message))
}

async function checkLevel(env: Envelope, depth: number): Promise<LevelResult> {
  const { statement, attestation, parent } = env
  const p = statement?.predicate
  const checks: Check[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail })

  const shapeOk =
    statement?._type === "https://in-toto.io/Statement/v1" && statement.predicateType === "https://attestai.local/job/v1"
  add("shape", "Statement format", shapeOk ? "pass" : "fail", shapeOk ? "in-toto Statement v1, attestai job v1" : "Unsupported statement type")

  const statementSha256 = await sha256(canonical(statement))

  try {
    const ok = await verifyEd25519(env.public_key, env.signature, canonical(statement))
    add("signature", "Ed25519 signature", ok ? "pass" : "fail", ok ? "Signature covers the canonical statement bytes" : "Signature does not match statement")
  } catch (e) {
    add("signature", "Ed25519 signature", "fail", `Could not verify: ${(e as Error).message}`)
  }

  const promptOk = p && (await sha256(p.prompt)) === p.prompt_sha256
  add("prompt", "Prompt digest", promptOk ? "pass" : "fail", promptOk ? "sha256(prompt) matches prompt_sha256" : "Prompt text does not match its signed digest")

  if (parent) {
    const linkOk = p?.parent_statement_sha256 === (await sha256(canonical(parent.statement)))
    add("parent", "Parent link", linkOk ? "pass" : "fail", linkOk ? "Parent statement hash matches" : "Parent hash mismatch")
  } else {
    const rootOk = p?.parent_statement_sha256 === null
    add("parent", "Parent link", rootOk ? "pass" : "fail", rootOk ? "Root of the prompt chain" : "Parent statement is missing")
  }

  if (attestation?.type === "dev/none") {
    add("attestation", "Hardware attestation", p?.mode === "dev" ? "warn" : "fail", "Development build: no enclave quote, authorship is not trusted")
  } else if (attestation?.type === "tinfoil/v3" && p?.mode === "tinfoil") {
    add("attestation", "Hardware attestation", "deferred", "Nonce-bound Tinfoil V3 quote present; in-browser quote verification is not implemented yet")
  } else {
    add("attestation", "Hardware attestation", "fail", `Invalid attestation type "${attestation?.type}"`)
  }

  add("artifact", "Artifact & CID", "deferred", "Download dist/ and re-hash files / UnixFS CID (not implemented yet)")
  return { depth, statementSha256, checks }
}

/** Checks the whole chain. With `appJson`, also checks the listing is the signed dist/app.json. */
export async function verifyEnvelope(envelope: Envelope, appJson?: string): Promise<VerifyResult> {
  const levels: LevelResult[] = []
  let e: Envelope | undefined = envelope
  for (let depth = 0; e && depth <= 32; depth++, e = e.parent) levels.push(await checkLevel(e, depth))
  if (e) levels[levels.length - 1].checks.push({ id: "depth", label: "Chain depth", status: "fail", detail: "More than 32 ancestors" })
  if (appJson !== undefined) {
    const entry = envelope.statement?.predicate?.artifact?.manifest?.find((f) => f.path === "app.json")
    const ok = !!entry && entry.sha256 === (await sha256(appJson))
    levels[0].checks.splice(4, 0, {
      id: "listing",
      label: "Store listing",
      status: ok ? "pass" : "fail",
      detail: ok ? "Name and description come from the signed dist/app.json" : entry ? "Listing does not match the signed app.json" : "Build has no app.json",
    })
  }
  const all = levels.flatMap((l) => l.checks)
  const overall: Overall = all.some((c) => c.status === "fail")
    ? "failed"
    : all.some((c) => c.status === "warn")
      ? "dev"
      : all.some((c) => c.status === "deferred" && c.id === "attestation")
        ? "partial"
        : "verified"
  return { overall, levels: levels.reverse() } // oldest prompt first
}
