import * as React from "react"

import { parseAppJson } from "./contract"
import { DEFAULT_RELAYS, fetchListings } from "./nostr"
import { useSession } from "./session"
import type { Envelope, StoreApp } from "./types"
import { verifyEnvelope, type VerifyResult } from "./verify"

type StoreState = {
  /** Only apps that passed verification. Failed listings never show up. */
  apps: StoreApp[]
  loading: boolean
  error: string | null
  results: Record<string, VerifyResult | undefined>
  reload: () => void
}

const StoreContext = React.createContext<StoreState | null>(null)

type SampleEntry = { id: string; published_at: string; envelope: Envelope; app_json: string }

async function loadSamples(): Promise<StoreApp[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}registry.json`)
  if (!res.ok) return []
  const { apps } = (await res.json()) as { apps: SampleEntry[] }
  return apps.flatMap((a) => {
    try {
      return [{ ...parseAppJson(a.app_json), ...a, source: "sample" as const }]
    } catch {
      return []
    }
  })
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { config, ready } = useSession()
  const [apps, setApps] = React.useState<StoreApp[]>([])
  const [results, setResults] = React.useState<Record<string, VerifyResult | undefined>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const relays = config?.relays?.length ? config.relays : DEFAULT_RELAYS
      const [samples, listings] = await Promise.all([
        loadSamples().catch(() => []),
        fetchListings(relays).catch((e: Error) => {
          setError(`Could not reach relays: ${e.message}`)
          return []
        }),
      ])
      const all = [...listings, ...samples]
      const checked = await Promise.all(
        all.map(async (a) => [a.id, await verifyEnvelope(a.envelope, a.app_json).catch(() => null)] as const)
      )
      if (cancelled) return
      const res: Record<string, VerifyResult | undefined> = {}
      for (const [id, r] of checked) if (r) res[id] = r
      setResults(res)
      // Never list failed apps. Dev-signed apps only when the server accepts dev builds.
      const hideDev = true
      setApps(all.filter((a) => res[a.id] && res[a.id]!.overall !== "failed" && !(hideDev && res[a.id]!.overall === "dev")))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [config, ready, nonce])

  const reload = React.useCallback(() => setNonce((n) => n + 1), [])

  return <StoreContext.Provider value={{ apps, loading, error, results, reload }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = React.useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
