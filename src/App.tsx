import { SiteHeader } from "@/components/site-header"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useRoute } from "@/lib/router"
import { SessionProvider } from "@/lib/session"
import { StoreProvider } from "@/lib/store"
import { AppDetailPage } from "@/pages/app-detail"
import { BrowsePage } from "@/pages/browse"
import { BuildPage } from "@/pages/build"

export function App() {
  const route = useRoute()
  return (
    <SessionProvider>
      <StoreProvider>
        <TooltipProvider>
          <div className="min-h-svh bg-background">
            <SiteHeader route={route} />
            <main>
              {route.name === "app" ? (
                <AppDetailPage id={route.id} tab={route.tab} />
              ) : route.name === "build" ? (
                <BuildPage parentId={route.parentId} />
              ) : (
                <BrowsePage />
              )}
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </StoreProvider>
    </SessionProvider>
  )
}

export default App
