// Writes public/registry.json: sample apps built by the dev fake build (dev-signed, no
// hardware attestation). Real listings come from Nostr.
import { writeFile } from "node:fs/promises"

import { fakeBuild } from "../server/dev/fake-build.ts"
import { wrapPrompt, type AppMeta } from "../src/lib/contract.ts"
import type { Envelope } from "../src/lib/types.ts"

const samples: (AppMeta & { id: string; prompts: string[] })[] = [
  { id: "vault-notes", name: "Vault Notes", tagline: "Offline notes encrypted on your device", category: "Productivity", icon: "NotebookPen",
    description: "Write notes that are encrypted with libsodium before they ever touch storage. Works fully offline as an installable PWA.",
    prompts: [
      "Build an offline encrypted notes PWA. Notes are stored in IndexedDB and encrypted with libsodium secretbox using a key derived from a passphrase.",
      "Add a search bar that searches decrypted notes in memory only, and a lock button that wipes the key from memory.",
      "Add markdown preview for notes and an export button that downloads an encrypted backup file.",
    ] },
  { id: "pomodoro-garden", name: "Pomodoro Garden", tagline: "A focus timer that grows a plant", category: "Productivity", icon: "Sprout",
    description: "Classic 25/5 pomodoro timer. Every finished session grows your garden a little more.",
    prompts: [
      "Build a pomodoro timer PWA with 25 minute focus and 5 minute break sessions, using shadcn Button and Card.",
      "Each completed focus session should add a plant to a small garden grid that persists in localStorage.",
    ] },
  { id: "split-bill", name: "Split Bill", tagline: "Split a dinner bill in seconds", category: "Finance", icon: "Receipt",
    description: "Enter the total, tip and people. See what everyone owes, with uneven splits supported.",
    prompts: ["Build a bill splitting PWA: total, tip percentage, number of people, and optional per-person custom amounts. Show what each person owes."] },
  { id: "nostr-pocket", name: "Nostr Pocket", tagline: "Tiny read-only Nostr feed", category: "Social", icon: "Radio",
    description: "Generate a keypair locally and read notes from relays you choose. Keys never leave the browser.",
    prompts: [
      "Build a minimal Nostr client PWA with nostr-tools. Generate a keypair locally and show it as npub.",
      "Let the user add relay URLs and show a feed of the latest 50 text notes from those relays.",
    ] },
  { id: "local-llm-chat", name: "Local LLM Chat", tagline: "Chat UI for your own Ollama server", category: "AI", icon: "MessagesSquare",
    description: "A clean chat interface that talks to an Ollama server on your own machine using ollama-js.",
    prompts: [
      "Build a chat PWA using the ollama npm package that connects to a user-configurable Ollama host and streams responses.",
      "Add a model picker populated from the Ollama tags endpoint and keep conversation history in IndexedDB.",
    ] },
  { id: "p2p-whiteboard", name: "P2P Whiteboard", tagline: "Draw together over WebRTC", category: "Social", icon: "PenTool",
    description: "A shared canvas between two browsers using simple-peer. Signaling is copy-paste, no server needed.",
    prompts: ["Build a two-person whiteboard PWA with simple-peer. Use manual copy-paste signaling and sync strokes over the data channel."] },
  { id: "habit-grid", name: "Habit Grid", tagline: "Track habits on a yearly grid", category: "Health", icon: "CalendarCheck",
    description: "Tick off daily habits and see your streaks on a contribution-style grid.",
    prompts: ["Build a habit tracker PWA with a GitHub-style yearly contribution grid per habit, stored in localStorage."] },
]

const now = Date.parse("2026-11-01T12:00:00Z")
const apps = []
for (const [i, { id, prompts, ...meta }] of samples.entries()) {
  let envelope: Envelope | undefined
  for (const p of prompts) envelope = (await fakeBuild({ prompt: wrapPrompt(p), userPrompt: p, parent: envelope, meta })).envelope
  apps.push({ id, published_at: new Date(now - i * 2 * 86_400_000).toISOString(), envelope, app_json: JSON.stringify(meta, null, 2) + "\n" })
}
await writeFile(new URL("../public/registry.json", import.meta.url), JSON.stringify({ version: 2, apps }, null, 2))
console.log(`wrote ${apps.length} sample apps`)
