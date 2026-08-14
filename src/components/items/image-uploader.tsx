import { useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { combineColorSuggestions } from '#/lib/colors/combine-suggestions'
import type { ColorSuggestion } from '#/lib/colors/combine-suggestions'
import { analyzeImage, sampleImageAt } from '#/lib/images/analyze-image'
import type { AnalyzedImage } from '#/lib/images/analyze-image'

export interface ImageAsset extends AnalyzedImage {
  id: string
}

interface Props {
  initialUrl?: string | null
  onAssetsChange: (assets: ReadonlyArray<ImageAsset>) => void
  onSuggestColor?: (suggestion: ColorSuggestion) => void
  onEyedrop?: (suggestion: ColorSuggestion) => void
}

const MAX_IMAGES = 12

export function ImageUploader({
  initialUrl,
  onAssetsChange,
  onSuggestColor,
  onEyedrop,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const remaining = MAX_IMAGES - assets.length
    if (remaining <= 0) {
      setError(`You can add at most ${MAX_IMAGES} images`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const next: ImageAsset[] = []
      for (const file of [...fileList].slice(0, remaining)) {
        const analyzed = await analyzeImage(file)
        next.push({
          ...analyzed,
          id: `${Date.now()}-${next.length}-${file.name}`,
        })
      }
      const merged = [...assets, ...next]
      setAssets(merged)
      onAssetsChange(merged)
      const suggestion = combineColorSuggestions(
        merged.map((asset) => asset.suggestion),
      )
      if (suggestion) onSuggestColor?.(suggestion)
      if (fileList.length > remaining) {
        setError(`Only ${MAX_IMAGES} images can be added`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (libraryInputRef.current) libraryInputRef.current.value = ''
    }
  }

  function removeAsset(id: string) {
    const next = assets.filter((asset) => asset.id !== id)
    setAssets(next)
    onAssetsChange(next)
    const suggestion = combineColorSuggestions(
      next.map((asset) => asset.suggestion),
    )
    if (suggestion) onSuggestColor?.(suggestion)
  }

  async function handlePreviewClick(
    asset: ImageAsset,
    event: React.MouseEvent<HTMLImageElement>,
  ) {
    if (!onEyedrop) return
    const rect = event.currentTarget.getBoundingClientRect()
    const suggestion = await sampleImageAt(asset.source, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
    onEyedrop(suggestion)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy}
        >
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => libraryInputRef.current?.click()}
          disabled={busy}
        >
          Upload photos
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">Preparing…</span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {assets.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {assets.map((asset, index) => (
            <div key={asset.id} className="relative space-y-1">
              <img
                src={asset.previewUrl}
                alt={`Selected image ${index + 1}`}
                className="aspect-square w-full cursor-crosshair rounded border object-cover"
                onClick={(event) => void handlePreviewClick(asset, event)}
              />
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline"
                onClick={() => removeAsset(asset.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : initialUrl ? (
        <img
          src={initialUrl}
          alt="Current item color"
          className="rounded border max-h-72"
        />
      ) : null}

      {assets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Click an image to sample a point; color suggestions use all selected
          images.
        </p>
      )}
    </div>
  )
}
