import * as React from "react"
// Browser entry skips qrcode's node fs/stream transitive path.
// @ts-expect-error – no type declarations for the /lib/browser.js subpath
import QRCode from "qrcode/lib/browser.js"
import { Button } from "#/components/ui/button"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"
import { shrinkImage } from "#/lib/images/shrink-image"
import {
  createPhotoUploadToken,
  getPhotoUploadStatus,
} from "#/server/functions/products/photo-handoff"
import { getProductImageUploadUrl } from "#/server/functions/products/uploads"
import { setProductColorImage } from "#/server/functions/products/colors"
import { productImageUrl } from "#/lib/products"

interface Props {
  productColorId: string
  onUploaded: (imageUrl: string) => void
}

/**
 * Device-aware product-photo capture.
 *
 * Desktop: shows a QR code; user scans with phone and uploads through the
 * /upload-photo/:token route. We poll for completion every 2s.
 *
 * Mobile: shows a "Take photo" button that opens the camera directly,
 * shrinks the file client-side, and uploads via a presigned URL.
 */
export function PhotoCapture(props: Props) {
  const isMobile = useIsMobile()
  return isMobile ? <MobileCapture {...props} /> : <DesktopHandoff {...props} />
}

// Backwards-compatible alias for the previous name.
export const PhotoHandoffQR = PhotoCapture

// ---------------------------------------------------------------------------
// Mobile — direct camera capture + presigned upload
// ---------------------------------------------------------------------------

type MobileState = "idle" | "shrinking" | "uploading" | "error"

function MobileCapture({ productColorId, onUploaded }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<MobileState>("idle")
  const [error, setError] = React.useState<string | null>(null)

  async function onFile(file: File) {
    setError(null)
    try {
      setState("shrinking")
      const blob = await shrinkImage(file)

      setState("uploading")
      const { uploadUrl, s3Key } = await getProductImageUploadUrl({
        data: { productColorId, contentType: "image/jpeg" },
      })
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      await setProductColorImage({ data: { id: productColorId, imageS3Key: s3Key } })

      const url = productImageUrl(s3Key)
      if (url) onUploaded(url)
      setState("idle")
    } catch (e) {
      setState("error")
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ""
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={state === "shrinking" || state === "uploading"}
      >
        {state === "shrinking"
          ? "Preparing…"
          : state === "uploading"
            ? "Uploading…"
            : "Take photo"}
      </Button>
      {state === "error" && error && (
        <div className="text-xs text-red-600">{error}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop — QR handoff to phone, poll for upload completion
// ---------------------------------------------------------------------------

function DesktopHandoff({ productColorId, onUploaded }: Props) {
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
    const id = setInterval(() => {
      void (async () => {
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
      })()
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
