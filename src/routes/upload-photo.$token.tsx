import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import {
  redeemPhotoUploadToken,
  confirmPhotoUpload,
} from '#/server/functions/items/photo-handoff'
import { shrinkImage } from '#/lib/images/shrink-image'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/upload-photo/$token')({
  loader: ({ params }) => ({ token: params.token }),
  component: UploadPhotoPage,
})

type UiState = 'idle' | 'shrinking' | 'uploading' | 'done' | 'error'

function UploadPhotoPage() {
  const { token } = Route.useLoaderData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<UiState>('idle')
  const [error, setError] = React.useState<string | null>(null)

  async function onFile(file: File) {
    setError(null)
    try {
      setState('shrinking')
      const blob = await shrinkImage(file)

      setState('uploading')
      const { uploadUrl } = await redeemPhotoUploadToken({
        data: { token, contentType: 'image/jpeg' },
      })
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await confirmPhotoUpload({ data: { token } })
      setState('done')
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-bold">Take a product photo</h1>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
          }}
        />
        {state === 'idle' && (
          <Button size="lg" onClick={() => inputRef.current?.click()}>
            Take photo
          </Button>
        )}
        {state === 'shrinking' && (
          <div className="text-muted-foreground">Preparing photo…</div>
        )}
        {state === 'uploading' && (
          <div className="text-muted-foreground">Uploading…</div>
        )}
        {state === 'done' && (
          <div className="text-green-700 font-medium">
            Done — return to your computer.
          </div>
        )}
        {state === 'error' && (
          <div className="space-y-2">
            <div className="text-red-600 text-sm">{error}</div>
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
