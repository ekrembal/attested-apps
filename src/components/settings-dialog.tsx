import { useState } from "react"
import { Settings } from "lucide-react"
import { toast } from "sonner"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Input } from "./ui/input"
import { saveSettings, settings } from "@/lib/settings"

export function SettingsDialog() {
  const [backend, setBackend] = useState(settings.backend)
  const [pinata, setPinata] = useState(settings.pinata)
  const [gateway, setGateway] = useState(settings.gateway)
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" aria-label="Settings" />}
      >
        <Settings />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Saved in this browser. Empty backend uses the same origin. Saving
            reloads the app.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2">
          BACKEND_URL
          <Input
            value={backend}
            onChange={(e) => setBackend(e.target.value)}
            placeholder="https://your-backend.trycloudflare.com"
          />
        </label>
        <label className="grid gap-2">
          PINATA_API_KEY
          <Input
            type="password"
            value={pinata}
            onChange={(e) => setPinata(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          The Pinata JWT is kept in localStorage and is accessible to scripts on
          this site. Use a scoped upload key.
        </p>
        <label className="grid gap-2">
          IPFS gateway
          <Input value={gateway} onChange={(e) => setGateway(e.target.value)} />
        </label>
        <DialogFooter>
          <Button
            onClick={() => {
              try {
                saveSettings(backend.trim(), pinata.trim(), gateway.trim())
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
