import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { itemImageUrl } from '#/lib/items'
import type { RankedColorSuggestion } from '#/lib/colors/rank-suggestions'

export interface ItemGalleryImage {
  id: string
  imageS3Key: string
  suggestedColorName: string | null
  suggestedColorHex: string | null
  sampledHex: string | null
}

interface Props {
  itemName: string
  images: ReadonlyArray<ItemGalleryImage>
  canManage: boolean
  actions?: ReactNode
  onRequestRemove: (imageS3Key: string, index: number) => void
  onDetectColors: () => void
  detecting: boolean
  suggestions: ReadonlyArray<RankedColorSuggestion>
  existingColorNames: ReadonlyArray<string>
  selectedSuggestionKeys: ReadonlySet<string>
  onToggleSuggestion: (key: string) => void
  onConfirmSuggestions: () => void
  confirming: boolean
  detectionMessage?: string
}

function suggestionKey(
  suggestion: Pick<RankedColorSuggestion, 'name' | 'hex'>,
) {
  return `${suggestion.name.trim().toLowerCase()}\u0000${suggestion.hex.toLowerCase()}`
}

export function ItemImageGallery({
  itemName,
  images,
  canManage,
  actions,
  onRequestRemove,
  onDetectColors,
  detecting,
  suggestions,
  existingColorNames,
  selectedSuggestionKeys,
  onToggleSuggestion,
  onConfirmSuggestions,
  confirming,
  detectionMessage,
}: Props) {
  const imageSignature = images.map((image) => image.imageS3Key).join('\u0000')
  const firstImageKey = images[0]?.imageS3Key ?? null
  const [selectedImageKey, setSelectedImageKey] = useState(firstImageKey)

  useEffect(() => {
    const availableKeys = imageSignature ? imageSignature.split('\u0000') : []
    setSelectedImageKey((current) =>
      current && availableKeys.includes(current) ? current : firstImageKey,
    )
  }, [firstImageKey, imageSignature])

  const selectedIndex = selectedImageKey
    ? images.findIndex((image) => image.imageS3Key === selectedImageKey)
    : -1
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null
  const imageCountLabel =
    images.length === 1 ? '1 photo' : `${images.length} photos`
  const existingNames = useMemo(
    () => new Set(existingColorNames.map((name) => name.trim().toLowerCase())),
    [existingColorNames],
  )
  const selectableSuggestionCount = suggestions.filter(
    (suggestion) => !existingNames.has(suggestion.name.trim().toLowerCase()),
  ).length

  return (
    <section aria-labelledby="item-photos-heading" className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 id="item-photos-heading" className="text-lg font-semibold">
              Photos
            </h2>
            <Badge variant="outline">{imageCountLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            One item gallery. Use it to recognize the item and suggest colors.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {actions}
            <Button
              type="button"
              variant="outline"
              onClick={onDetectColors}
              disabled={images.length === 0 || detecting}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {detecting ? 'Detecting…' : 'Detect colors'}
            </Button>
          </div>
        )}
      </header>
      {detectionMessage && (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {detectionMessage}
        </p>
      )}

      {selectedImage ? (
        <div className="overflow-hidden rounded-xl border bg-muted/30 shadow-sm">
          <img
            src={itemImageUrl(selectedImage.imageS3Key)}
            alt={`${itemName} photo ${selectedIndex + 1}`}
            width={960}
            height={720}
            className="aspect-[4/3] size-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
          <p className="font-medium">No photos yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Add a clear product photo so the item is easy to recognize.
          </p>
        </div>
      )}

      {images.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          aria-label="Photo thumbnails"
          role="list"
        >
          {images.map((image, index) => {
            const selected = image.imageS3Key === selectedImageKey
            return (
              <div
                key={image.id}
                className="group relative min-w-20"
                role="listitem"
              >
                <button
                  type="button"
                  aria-label={`Show photo ${index + 1}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => setSelectedImageKey(image.imageS3Key)}
                  className={`block aspect-square w-20 touch-manipulation overflow-hidden rounded-lg border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:border-foreground/50'}`}
                >
                  <img
                    src={itemImageUrl(image.imageS3Key)}
                    alt={`${itemName} thumbnail ${index + 1}`}
                    width={160}
                    height={160}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    className="size-full object-cover"
                  />
                </button>
                {canManage && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Remove photo ${index + 1}`}
                    title={`Remove photo ${index + 1}`}
                    className="absolute right-1 top-1 touch-manipulation shadow-sm"
                    onClick={() => onRequestRemove(image.imageS3Key, index)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {suggestions.length > 0 && (
        <section
          aria-labelledby="suggested-colors-heading"
          className="space-y-3 rounded-xl border bg-muted/20 p-4"
        >
          <div>
            <h3 id="suggested-colors-heading" className="font-medium">
              Suggested colors
            </h3>
            <p className="text-sm text-muted-foreground">
              Review the colors found in your photos, then add only the ones you
              want to track.
            </p>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion) => {
              const key = suggestionKey(suggestion)
              const alreadyAdded = existingNames.has(
                suggestion.name.trim().toLowerCase(),
              )
              return (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={alreadyAdded || selectedSuggestionKeys.has(key)}
                    disabled={alreadyAdded}
                    onChange={() => onToggleSuggestion(key)}
                    aria-label={suggestion.name}
                    className="size-4 accent-primary"
                  />
                  <span
                    className="size-5 shrink-0 rounded-full border"
                    style={{ backgroundColor: suggestion.hex }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{suggestion.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Seen in {suggestion.imageCount}{' '}
                      {suggestion.imageCount === 1 ? 'photo' : 'photos'}
                    </span>
                  </span>
                  {alreadyAdded && (
                    <span className="text-xs text-muted-foreground">
                      Already added
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {selectableSuggestionCount === 0
                ? 'All suggested colors are already added.'
                : `${selectedSuggestionKeys.size} selected`}
            </p>
            <Button
              type="button"
              onClick={onConfirmSuggestions}
              disabled={selectedSuggestionKeys.size === 0 || confirming}
            >
              {confirming ? 'Adding…' : 'Add selected colors'}
            </Button>
          </div>
        </section>
      )}
    </section>
  )
}
