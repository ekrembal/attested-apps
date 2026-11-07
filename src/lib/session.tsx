import * as React from "react"

import { api, API_ORIGIN, ApiError, type Quota, type ServerConfig } from "./api"
import { extensionSigner, localSigner, type Signer } from "./nostr"

type SessionState = {
  config: ServerConfig | null
  pubkey: string | null
  quota: Quota | null
  ready: boolean
  signIn: (kind: "extension" | "local") => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  /** Signer for the signed-in pubkey (asks the extension if needed). */
  getSigner: () => Promise<Signer>
}

const SessionContext = React.createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<ServerConfig | null>(null)
  const [pubkey, setPubkey] = React.useState<string | null>(null)
  const [quota, setQuota] = React.useState<Quota | null>(null)
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.me()
      setPubkey(me.pubkey)
      setQuota(me.quota)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPubkey(null)
        setQuota(null)
      }
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await api.config().catch(() => null)
      await refresh()
      if (cancelled) return
      setConfig(cfg)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const signIn = React.useCallback(
    async (kind: "extension" | "local") => {
      const signer = kind === "extension" ? await extensionSigner() : localSigner(true)!
      const event = await signer.sign({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["u", `${API_ORIGIN}/api/auth/login`],
          ["method", "POST"],
        ],
        content: "",
      })
      await api.login(event)
      await refresh()
    },
    [refresh]
  )

  const signOut = React.useCallback(async () => {
    await api.logout().catch(() => {})
    setPubkey(null)
    setQuota(null)
  }, [])

  const getSigner = React.useCallback(async () => {
    const local = localSigner(false)
    if (local && local.pubkey === pubkey) return local
    const ext = await extensionSigner()
    if (ext.pubkey !== pubkey) throw new Error("Your Nostr extension is using a different key than this session")
    return ext
  }, [pubkey])

  return (
    <SessionContext.Provider value={{ config, pubkey, quota, ready, signIn, signOut, refresh, getSigner }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = React.useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
