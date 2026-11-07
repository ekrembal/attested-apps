import { unpackTar } from "modern-tar"
import type { Envelope } from "./types"

const digest = async (data: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")

export async function uploadToPinata(
  artifact: ArrayBuffer,
  envelope: Envelope,
  jwt: string
) {
  if (!jwt) throw new Error("Set PINATA_API_KEY in Settings first")
  if ((await digest(artifact)) !== envelope.statement.subject[0]?.digest.sha256)
    throw new Error("Artifact SHA-256 does not match the signed statement")
  const entries = await unpackTar(
    new Blob([artifact]).stream().pipeThrough(new DecompressionStream("gzip"))
  )
  const manifest = new Map(
    envelope.statement.predicate.artifact.manifest.map((entry) => [
      entry.path,
      entry,
    ])
  )
  const seen = new Set<string>()
  const form = new FormData()
  for (const { header, data } of entries) {
    const name = header.name.replace(/^\.\//, "")
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      !(name === "dist" || name.startsWith("dist/"))
    )
      throw new Error("Unsafe artifact path")
    if (header.type === "directory") continue
    if (header.type !== "file" || !data)
      throw new Error("Artifact contains a link or special file")
    const relative = name.slice("dist/".length)
    const entry = manifest.get(relative)
    const bytes = new Uint8Array(data).buffer
    if (
      !entry ||
      seen.has(relative) ||
      bytes.byteLength !== entry.size ||
      (await digest(bytes)) !== entry.sha256
    )
      throw new Error(`Signed manifest mismatch: ${relative}`)
    seen.add(relative)
    form.append("file", new Blob([bytes]), `dist/${relative}`)
  }
  if (!seen.size || seen.size !== manifest.size)
    throw new Error("Artifact is missing signed files")
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }))
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: envelope.statement.predicate.artifact.cid })
  )
  const response = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form }
  )
  if (!response.ok)
    throw new Error(`Pinata upload failed (HTTP ${response.status})`)
  const result = (await response.json()) as { IpfsHash?: string }
  const expected = envelope.statement.predicate.artifact.cid
  if (result.IpfsHash !== expected)
    throw new Error(
      `Pinata CID mismatch: expected ${expected}, received ${result.IpfsHash ?? "no CID"}. Do not publish this upload.`
    )
  return expected
}
