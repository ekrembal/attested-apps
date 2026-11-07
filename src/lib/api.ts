import type { Envelope } from "./types"
import type { VerifyResult } from "./verify"
import { sessionKey, sessionToken, settings } from "./settings"

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
export const API_BASE: string = settings.backend
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
    credentials: "omit",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
      ...(sessionToken() ? { Authorization: `Bearer ${sessionToken()}` } : {}),
    },
  })
  if (!res.headers.get("content-type")?.includes("application/json")) throw new ApiError(res.status, "Expected a store server response. Set BACKEND_URL in Settings.")
  const body = await res.json()
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  return body as T
}

export const api = {
  config: () => call<ServerConfig>("/api/config"),
  me: () => call<{ pubkey: string; quota: Quota }>("/api/me"),
  login: async (event: unknown) => {
    const result = await call<{ pubkey: string; token: string }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ event }) }
    )
    localStorage.setItem(sessionKey(), result.token)
    return result
  },
  logout: async () => {
    try {
      return await call("/api/auth/logout", { method: "POST" })
    } finally {
      localStorage.removeItem(sessionKey())
    }
  },
  builds: () => call<BuildSummary[]>("/api/builds"),
  build: (id: string) => call<BuildDetail>(`/api/builds/${id}`),
  createBuild: (prompt: string, parent?: Envelope) =>
    call<BuildSummary>("/api/builds", { method: "POST", body: JSON.stringify({ prompt, parent }) }),
  markPublished: (id: string, eventId: string) =>
    call<BuildSummary>(`/api/builds/${id}/published`, { method: "POST", body: JSON.stringify({ eventId }) }),
  artifactUrl: (id: string) => `${API_BASE}/api/builds/${id}/artifact`,
  artifact: async (id: string) => {
    const res = await fetch(`${API_BASE}/api/builds/${id}/artifact`, {
      headers: { Authorization: `Bearer ${sessionToken() ?? ""}` },
      credentials: "omit",
    })
    if (!res.ok)
      throw new ApiError(
        res.status,
        `Artifact download failed (HTTP ${res.status})`
      )
    return res.arrayBuffer()
  },
}
