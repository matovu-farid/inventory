import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  redeemPhotoUploadToken,
  confirmPhotoUpload,
} from "#/server/functions/products/photo-handoff"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/upload-photo/$token")({
  loader: ({ params }) => ({ token: params.token }),
  component: UploadPhotoPage,
})

type UiState = "idle" | "uploading" | "done" | "error"

function UploadPhotoPage() {
  const { token } = Route.useLoaderData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<UiState>("idle")
  const [error, setError] = React.useState<string | null>(null)

  async function onFile(file: File) {
    setState("uploading")
    setError(null)
    try {
      const { uploadUrl } = await redeemPhotoUploadToken({
        data: { token, contentType: file.type },
      })
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await confirmPhotoUpload({ data: { token } })
      setState("done")
    } catch (e) {
      setState("error")
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
        {state === "idle" && (
          <Button size="lg" onClick={() => inputRef.current?.click()}>
            Take photo
          </Button>
        )}
        {state === "uploading" && (
          <div className="text-muted-foreground">Uploading…</div>
        )}
        {state === "done" && (
          <div className="text-green-700 font-medium">
            Done — return to your computer.
          </div>
        )}
        {state === "error" && (
          <div className="space-y-2">
            <div className="text-red-600 text-sm">{error}</div>
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
