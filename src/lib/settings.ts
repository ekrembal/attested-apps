const saved = (key: string, fallback: string) =>
  localStorage.getItem(key) ?? fallback

export const settings = {
  backend: saved(
    "BACKEND_URL",
    import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_URL ?? ""
  ).replace(/\/$/, ""),
  pinata: saved("PINATA_API_KEY", import.meta.env.VITE_PINATA_API_KEY ?? ""),
  gateway: saved("IPFS_GATEWAY", "https://dweb.link"),
}

export const sessionKey = () =>
  `attested-apps:session:${settings.backend || location.origin}`
export const sessionToken = () => localStorage.getItem(sessionKey())

export function saveSettings(backend: string, pinata: string, gateway: string) {
  for (const value of [backend, gateway]) {
    if (value && !["https:", "http:"].includes(new URL(value).protocol))
      throw new Error("Use an HTTP or HTTPS URL")
  }
  if (!gateway) throw new Error("An IPFS gateway is required")
  localStorage.setItem("BACKEND_URL", backend.replace(/\/$/, ""))
  localStorage.setItem("PINATA_API_KEY", pinata)
  localStorage.setItem("IPFS_GATEWAY", gateway.replace(/\/$/, ""))
  location.reload()
}
