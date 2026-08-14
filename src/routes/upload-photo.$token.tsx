import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Button } from '#/components/ui/button'
import { analyzeImage } from '#/lib/images/analyze-image'
import {
  completePhotoUploadSession,
  confirmPhotoUpload,
  redeemPhotoUploadToken,
} from '#/server/functions/items/photo-handoff'

export const Route = createFileRoute('/upload-photo/$token')({
  loader: ({ params }) => ({ token: params.token }),
  component: UploadPhotoPage,
})

type UiState = 'idle' | 'processing' | 'done' | 'error'

interface UploadedPhoto {
  id: string
  imageUrl: string
  suggestedColorName: string | null
  suggestedColorHex: string | null
  sampledHex: string | null
}

interface UploadReservation {
  uploadId: string
  uploadUrl: string
  s3Key: string
}

interface UploadAttempt {
  file: File
  reservation?: UploadReservation
}

function UploadPhotoPage() {
  const { token } = Route.useLoaderData()
  const libraryInputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<UiState>('idle')
  const [uploads, setUploads] = React.useState<UploadedPhoto[]>([])
  const [failedAttempts, setFailedAttempts] = React.useState<UploadAttempt[]>(
    [],
  )
  const [error, setError] = React.useState<string | null>(null)

  async function processAttempts(attempts: UploadAttempt[], truncated = false) {
    if (attempts.length === 0) return
    setState('processing')
    setError(null)
    const failed: UploadAttempt[] = []
    try {
      for (const attempt of attempts) {
        let reservation = attempt.reservation
        try {
          const analyzed = await analyzeImage(attempt.file)
          const activeReservation =
            reservation ??
            (await redeemPhotoUploadToken({
              data: { token, contentType: 'image/jpeg' },
            }))
          reservation = activeReservation
          const response = await fetch(activeReservation.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: analyzed.blob,
          })
          if (!response.ok)
            throw new Error(`Upload failed (${response.status})`)
          const confirmed = await confirmPhotoUpload({
            data: {
              token,
              uploadId: activeReservation.uploadId,
              suggestion: analyzed.suggestion,
            },
          })
          setUploads((current) => [
            ...current,
            {
              id: activeReservation.uploadId,
              imageUrl: confirmed.imageUrl,
              suggestedColorName: analyzed.suggestion.name,
              suggestedColorHex: analyzed.suggestion.hex,
              sampledHex: analyzed.suggestion.sampledHex,
            },
          ])
        } catch (cause) {
          failed.push({ file: attempt.file, reservation })
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    } finally {
      setFailedAttempts(failed)
      if (truncated && failed.length === 0) {
        setError('Only 12 photos can be added to one session')
      }
      setState(failed.length > 0 ? 'error' : 'idle')
      if (libraryInputRef.current) libraryInputRef.current.value = ''
    }
  }

  async function onFiles(fileList: FileList | File[]) {
    const files = [...fileList]
    if (files.length === 0) return
    const available = Math.max(0, 12 - uploads.length - failedAttempts.length)
    if (available === 0) {
      setError('Only 12 photos can be added to one session')
      setState('error')
      return
    }
    await processAttempts(
      files.slice(0, available).map((file) => ({ file })),
      files.length > available,
    )
  }

  async function retryFailed() {
    await processAttempts(failedAttempts)
  }

  async function finish() {
    setState('processing')
    setError(null)
    try {
      await completePhotoUploadSession({ data: { token } })
      setState('done')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (state === 'done') {
    return (
      <PageShell>
        <h1 className="text-xl font-bold">Photos sent</h1>
        <p className="text-muted-foreground">
          {uploads.length} photo{uploads.length === 1 ? '' : 's'} added. Return
          to your computer.
        </p>
      </PageShell>
    )
  }

  const busy = state === 'processing'
  const noMorePhotos = uploads.length + failedAttempts.length >= 12
  return (
    <PageShell>
      <h1 className="text-xl font-bold">Add product photos</h1>
      <p className="text-sm text-muted-foreground">
        Choose several photos. You do not need to sign in on this phone.
      </p>

      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onFiles(event.target.files ?? [])}
      />

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="lg"
          onClick={() => libraryInputRef.current?.click()}
          disabled={busy || noMorePhotos}
        >
          Choose photos
        </Button>
      </div>

      {busy && (
        <div className="text-muted-foreground" role="status" aria-live="polite">
          Preparing and uploading…
        </div>
      )}
      {error && (
        <div
          className="space-y-2 text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          <p>{error}</p>
          {failedAttempts.length > 0 && (
            <Button variant="outline" onClick={() => void retryFailed()}>
              Retry failed photos
            </Button>
          )}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {uploads.map((upload, index) => (
            <img
              key={upload.id}
              src={upload.imageUrl}
              alt={`Uploaded photo ${index + 1}`}
              className="aspect-square rounded border object-cover"
            />
          ))}
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        onClick={() => void finish()}
        disabled={busy}
      >
        Done
      </Button>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-4 text-center">{children}</div>
    </div>
  )
}
