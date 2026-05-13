import * as React from "react"
// Import the browser entry directly — the default "qrcode" entry pulls in
// node "fs"/"stream", which Vite externalizes for the browser and triggers
// "Module 'events' has been externalized" at runtime.
// @ts-expect-error – no type declarations for the /lib/browser.js subpath
import QRCode from "qrcode/lib/browser.js"
import { Button } from "#/components/ui/button"
import {
  createPhotoUploadToken,
  getPhotoUploadStatus,
} from "#/server/functions/products/photo-handoff"

interface Props {
  productColorId: string
  onUploaded: (imageUrl: string) => void
}

/**
 * Renders a QR code that a phone can scan to take and upload a product photo.
 * Polls the server every 2s for token consumption; once consumed, calls
 * onUploaded and clears the QR. Token expires after 15 minutes.
 */
export function PhotoHandoffQR({ productColorId, onUploaded }: Props) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [generating, setGenerating] = React.useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const result = await createPhotoUploadToken({ data: { productColorId } })
      const png = await QRCode.toDataURL(result.url, { width: 256, margin: 1 })
      setDataUrl(png)
      setToken(result.token)
      setExpiresAt(new Date(result.expiresAt))
    } finally {
      setGenerating(false)
    }
  }

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    if (!token) return
    const id = setInterval(async () => {
      const status = await getPhotoUploadStatus({ data: { token } })
      if (status.status === "consumed" && status.imageUrl) {
        clearInterval(id)
        onUploaded(status.imageUrl)
        setDataUrl(null)
        setToken(null)
        setExpiresAt(null)
      } else if (status.status === "expired") {
        clearInterval(id)
        // Keep dataUrl rendered with the Expired label; user clicks Regenerate.
      }
    }, 2000)
    return () => clearInterval(id)
  }, [token, onUploaded])

  const expired = !!(expiresAt && expiresAt.getTime() < now)
  const secondsLeft = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000))
    : 0
  const mm = Math.floor(secondsLeft / 60)
  const ss = (secondsLeft % 60).toString().padStart(2, "0")

  if (!dataUrl) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => void generate()}
        disabled={generating}
      >
        {generating ? "Generating…" : "Take with phone (QR)"}
      </Button>
    )
  }

  return (
    <div className="space-y-2 text-center">
      <img
        src={dataUrl}
        alt="Scan with phone"
        className="mx-auto rounded border bg-white"
        width={256}
        height={256}
      />
      <div className="text-xs text-muted-foreground">
        {expired
          ? "QR expired — generate a new one"
          : `Scan with your phone · expires in ${mm}:${ss}`}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void generate()}
        disabled={generating}
      >
        {generating ? "Generating…" : "Regenerate"}
      </Button>
    </div>
  )
}
