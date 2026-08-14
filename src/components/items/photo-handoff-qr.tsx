import * as React from 'react'
// Browser entry skips qrcode's node fs/stream transitive path.
// @ts-expect-error – no type declarations for the /lib/browser.js subpath
import QRCode from 'qrcode/lib/browser.js'
import { Button } from '#/components/ui/button'
import { useIsMobile } from '#/lib/hooks/use-is-mobile'
import { analyzeImage } from '#/lib/images/analyze-image'
import {
  createPhotoUploadToken,
  getPhotoUploadStatus,
  attachPhotoSessionImages,
} from '#/server/functions/items/photo-handoff'
import {
  attachUploadedItemImage,
  getItemImageUploadUrl,
} from '#/server/functions/items/uploads'

export interface PhotoUploadResult {
  id: string
  imageUrl: string
  suggestedColorName: string | null
  suggestedColorHex: string | null
  sampledHex: string | null
}

export interface CompletedPhotoSession {
  token: string
  uploads: PhotoUploadResult[]
}

interface Props {
  itemId: string
  onUploaded?: (uploads: PhotoUploadResult[]) => void
  onSessionCompleted?: (session: CompletedPhotoSession) => void
  onSessionStateChange?: (active: boolean) => void
}

/**
 * Device-aware product-photo capture.
 *
 * Item galleries can upload directly or through a multi-photo QR session.
 * Both paths attach photos to the item; colors are suggested separately.
 */
export function PhotoCapture(props: Props) {
  const isMobile = useIsMobile()
  return isMobile ? <MobileCapture {...props} /> : <DesktopHandoff {...props} />
}

export const PhotoHandoffQR = PhotoCapture

type UploadState = 'idle' | 'shrinking' | 'uploading' | 'error'

function UploadButton({
  itemId,
  onUploaded,
  idleLabel,
  size = 'default',
}: {
  itemId: string
  onUploaded: (uploads: PhotoUploadResult[]) => void
  idleLabel: string
  size?: 'sm' | 'default'
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<UploadState>('idle')
  const [error, setError] = React.useState<string | null>(null)

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    try {
      setState('shrinking')
      const uploads: PhotoUploadResult[] = []
      for (const file of [...fileList].slice(0, 12)) {
        const analyzed = await analyzeImage(file)
        setState('uploading')
        const { uploadUrl, publicUrl, s3Key } = await getItemImageUploadUrl({
          data: { itemId, contentType: 'image/jpeg' },
        })
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: analyzed.blob,
        })
        if (!response.ok) throw new Error(`Upload failed (${response.status})`)
        await attachUploadedItemImage({
          data: { itemId, imageS3Key: s3Key, suggestion: analyzed.suggestion },
        })
        uploads.push({
          id: `${itemId}-${uploads.length}`,
          imageUrl: publicUrl,
          suggestedColorName: analyzed.suggestion.name,
          suggestedColorHex: analyzed.suggestion.hex,
          sampledHex: analyzed.suggestion.sampledHex,
        })
      }
      onUploaded(uploads)
      setState('idle')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const busy = state === 'shrinking' || state === 'uploading'
  const label =
    state === 'shrinking'
      ? 'Preparing…'
      : state === 'uploading'
        ? 'Uploading…'
        : idleLabel

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onFiles(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {label}
      </Button>
      {state === 'error' && error && (
        <div className="text-xs text-red-600" role="alert" aria-live="polite">
          {error}
        </div>
      )}
    </div>
  )
}

function MobileCapture({ itemId, onUploaded, onSessionCompleted }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <UploadButton
        itemId={itemId}
        onUploaded={onUploaded ?? (() => {})}
        idleLabel="Choose images"
      />
      {onSessionCompleted && (
        <span className="text-xs text-muted-foreground">
          QR handoff is available on desktop.
        </span>
      )}
    </div>
  )
}

function DesktopHandoff({
  itemId,
  onUploaded,
  onSessionCompleted,
  onSessionStateChange,
}: Props) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const callbacks = React.useRef({
    onUploaded,
    onSessionCompleted,
    onSessionStateChange,
  })

  React.useEffect(() => {
    callbacks.current = {
      onUploaded,
      onSessionCompleted,
      onSessionStateChange,
    }
  }, [onSessionCompleted, onSessionStateChange, onUploaded])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const result = await createPhotoUploadToken({
        data: { itemId },
      })
      const png = await QRCode.toDataURL(result.url, { width: 256, margin: 1 })
      setDataUrl(png)
      setToken(result.token)
      setExpiresAt(new Date(result.expiresAt))
      callbacks.current.onSessionStateChange?.(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
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
        try {
          const status = await getPhotoUploadStatus({ data: { token } })
          if (status.status === 'completed') {
            clearInterval(id)
            const session: CompletedPhotoSession = {
              token,
              uploads: status.uploads,
            }
            callbacks.current.onSessionStateChange?.(false)
            if (callbacks.current.onSessionCompleted) {
              callbacks.current.onSessionCompleted(session)
            } else {
              await attachPhotoSessionImages({ data: { token, itemId } })
              callbacks.current.onUploaded?.(status.uploads)
            }
            setDataUrl(null)
            setToken(null)
            setExpiresAt(null)
          } else if (
            status.status === 'expired' ||
            status.status === 'missing'
          ) {
            clearInterval(id)
            callbacks.current.onSessionStateChange?.(false)
            setError(
              status.status === 'expired'
                ? 'QR expired'
                : 'QR session not found',
            )
          }
        } catch (cause) {
          clearInterval(id)
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })()
    }, 2000)
    return () => clearInterval(id)
  }, [itemId, token])

  const expired = !!(expiresAt && expiresAt.getTime() < now)
  const secondsLeft = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000))
    : 0
  const mm = Math.floor(secondsLeft / 60)
  const ss = (secondsLeft % 60).toString().padStart(2, '0')

  if (!dataUrl) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <UploadButton
            itemId={itemId}
            onUploaded={onUploaded ?? (() => {})}
            idleLabel="Choose images"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Use phone (QR)'}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-600" role="alert" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-center">
      <img
        src={dataUrl}
        alt="Scan with phone to add several photos"
        className="mx-auto rounded border bg-white"
        width={256}
        height={256}
      />
      <div className="text-xs text-muted-foreground">
        {expired
          ? 'QR expired — generate a new one'
          : `Scan once and add several photos · expires in ${mm}:${ss}`}
      </div>
      {error && (
        <p className="text-xs text-red-600" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <UploadButton
          itemId={itemId}
          onUploaded={onUploaded ?? (() => {})}
          idleLabel="Choose images"
          size="sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void generate()}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Regenerate'}
        </Button>
      </div>
    </div>
  )
}
