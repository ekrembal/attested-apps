import * as React from "react"

export type Route = { name: "browse" } | { name: "build"; parentId?: string } | { name: "app"; id: string; tab: string }

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean)
  if (parts[0] === "build") return { name: "build", parentId: parts[1] ? decodeURIComponent(parts[1]) : undefined }
  if (parts[0] === "app" && parts[1]) return { name: "app", id: decodeURIComponent(parts[1]), tab: parts[2] ?? "overview" }
  return { name: "browse" }
}

export function useRoute() {
  const [route, setRoute] = React.useState(() => parse(window.location.hash))
  React.useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export const href = {
  browse: () => "#/",
  build: (parentId?: string) => (parentId ? `#/build/${encodeURIComponent(parentId)}` : "#/build"),
  app: (id: string, tab?: string) => `#/app/${encodeURIComponent(id)}${tab && tab !== "overview" ? `/${tab}` : ""}`,
}

export function navigate(to: string) {
  window.location.hash = to.replace(/^#/, "")
}
