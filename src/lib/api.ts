import type { Envelope } from "./types"
import type { VerifyResult } from "./verify"

export type BuildStatus = "queued" | "running" | "verifying" | "ready" | "failed" | "rejected"
export type BuildSummary = {
  id: string
  prompt: string
  status: BuildStatus
  error?: string
  createdAt: number
  updatedAt: number
  hasParent: boolean
  publishedEventId?: string
  queuePosition?: number
}
export type BuildDetail = BuildSummary & {
  logs: string
  envelope?: Envelope
  appJson?: string
  verification?: VerifyResult
}
export type Quota = { used: number; limit: number; remaining: number }
export type ServerConfig = { relays: string[]; allowlist: boolean; buildsPerDay: number; maxPromptChars: number; allowDev: boolean }

/** Store server origin. Empty = same origin (dev proxy or served by the server). */
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
export const API_ORIGIN = API_BASE || window.location.origin

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: API_BASE ? "include" : "same-origin",
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  return body as T
}

export const api = {
  config: () => call<ServerConfig>("/api/config"),
  me: () => call<{ pubkey: string; quota: Quota }>("/api/me"),
  login: (event: unknown) => call<{ pubkey: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ event }) }),
  logout: () => call("/api/auth/logout", { method: "POST" }),
  builds: () => call<BuildSummary[]>("/api/builds"),
  build: (id: string) => call<BuildDetail>(`/api/builds/${id}`),
  createBuild: (prompt: string, parent?: Envelope) =>
    call<BuildSummary>("/api/builds", { method: "POST", body: JSON.stringify({ prompt, parent }) }),
  markPublished: (id: string, eventId: string) =>
    call<BuildSummary>(`/api/builds/${id}/published`, { method: "POST", body: JSON.stringify({ eventId }) }),
  artifactUrl: (id: string) => `${API_BASE}/api/builds/${id}/artifact`,
}
