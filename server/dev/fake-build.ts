// Dev-only stand-in for a tinfoil-experiments build. Produces the same envelope shape as
// harness/server.mjs, signed with a throwaway Ed25519 key and attestation "dev/none".
import { createHash, createPublicKey, generateKeyPairSync, sign } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { MemoryBlockstore } from "blockstore-core/memory"
import { importer } from "ipfs-unixfs-importer"
import * as tar from "tar"

import { canonical } from "../../src/lib/verify.ts"
import type { AppMeta } from "../../src/lib/contract.ts"
import type { Envelope, Statement } from "../../src/lib/types.ts"

const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex")
const AGENT = { name: "pi", package: "@earendil-works/pi-coding-agent", version: "1.5.0" }

function page(meta: AppMeta | null, prompt: string) {
  const title = meta?.name ?? "App"
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><link rel="manifest" href="/manifest.webmanifest"></head>
<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem"><h1>${title}</h1><p>${meta?.tagline ?? ""}</p>
<p style="color:#666">Placeholder build from the dev mock harness.</p><pre style="white-space:pre-wrap">${prompt.replace(/</g, "&lt;")}</pre>
<script>navigator.serviceWorker?.register('/sw.js')</script></body></html>`
}

export async function fakeBuild(opts: {
  prompt: string
  userPrompt: string
  parent?: Envelope
  meta: AppMeta | null
}): Promise<{ envelope: Envelope; tarball: Buffer }> {
  const { prompt, userPrompt, parent, meta } = opts
  const files: Record<string, string> = {
    "index.html": page(meta, userPrompt),
    "manifest.webmanifest": JSON.stringify({ name: meta?.name ?? "App", display: "standalone", start_url: "/", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }),
    "sw.js": `self.addEventListener("fetch", () => {}) // ${sha256(prompt).slice(0, 8)}`,
    "icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5"/><text x="12" y="17" font-size="13" text-anchor="middle" fill="#fff">${(meta?.name ?? "A")[0]}</text></svg>`,
    [`assets/index-${sha256(prompt).slice(0, 8)}.js`]: `console.log(${JSON.stringify(meta?.name ?? "app")});`.repeat(300),
  }
  if (meta) files["app.json"] = JSON.stringify(meta, null, 2) + "\n"

  const dir = await mkdtemp(path.join(tmpdir(), "fake-build-"))
  try {
    const names = Object.keys(files).sort()
    for (const name of names) {
      await mkdir(path.dirname(path.join(dir, "dist", name)), { recursive: true })
      await writeFile(path.join(dir, "dist", name), files[name])
    }
    const manifest = names.map((p) => ({ path: p, size: Buffer.byteLength(files[p]), sha256: sha256(files[p]) }))
    const entries = [
      { path: "dist" },
      { path: "dist/assets" },
      ...names.map((p) => ({ path: `dist/${p}`, content: Buffer.from(files[p]) })),
    ]
    let last
    for await (const entry of importer(entries, new MemoryBlockstore(), { cidVersion: 1, rawLeaves: true, wrapWithDirectory: false })) last = entry
    const archive = path.join(dir, "artifact.tar.gz")
    await tar.c({ gzip: true, file: archive, cwd: dir, portable: true, mtime: new Date(0) }, ["dist"])
    const tarball = await readFile(archive)

    const transcript = sha256(`transcript:${prompt}`)
    const statement: Statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: "dist.tar.gz", digest: { sha256: sha256(tarball) } }],
      predicateType: "https://attestai.local/job/v1",
      predicate: {
        mode: "dev",
        harness_image_digest: "dev/unpinned",
        config: { repo: "ekrembal/tinfoil-experiments" },
        model: "deepseek-v4-1-flash",
        prompt,
        prompt_sha256: sha256(prompt),
        parent_statement_sha256: parent ? sha256(canonical(parent.statement)) : null,
        artifact: { manifest, cid: last!.cid.toString() },
        inference_verification: { proxy: { name: "tinfoil-proxy", version: "0.2.9" }, verification_document: null, transcript_sha256: transcript },
        agent: AGENT,
        transcript: { name: "pi.jsonl", sha256: transcript },
      },
    }
    const key = generateKeyPairSync("ed25519").privateKey
    const envelope: Envelope = {
      statement,
      public_key: createPublicKey(key).export({ type: "spki", format: "pem" }).toString(),
      signature: sign(null, Buffer.from(canonical(statement)), key).toString("base64"),
      attestation: { type: "dev/none" },
      ...(parent ? { parent } : {}),
    }
    return { envelope, tarball }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
