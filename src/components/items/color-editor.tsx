import { useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { ColorPicker } from './color-picker'
import { ImageUploader } from './image-uploader'
import type { ImageAsset } from './image-uploader'
import { combineColorSuggestions } from '#/lib/colors/combine-suggestions'
import type { ColorSuggestion } from '#/lib/colors/combine-suggestions'
import { attachPhotoSessionImages } from '#/server/functions/items/photo-handoff'
import { addItemColor } from '#/server/functions/items/colors'
import {
  attachUploadedItemColorImage,
  getItemImageUploadUrl,
} from '#/server/functions/items/uploads'
import { PhotoCapture } from './photo-handoff-qr'
import type { CompletedPhotoSession } from './photo-handoff-qr'

interface Props {
  itemId: string
  onCreated: (itemColorId: string) => void
}

export function ColorEditor({ itemId, onCreated }: Props) {
  const [colorName, setColorName] = useState('')
  const [colorHex, setColorHex] = useState('#000000')
  const [sampledHex, setSampledHex] = useState<string | null>(null)
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [qrSession, setQrSession] = useState<CompletedPhotoSession | null>(null)
  const [qrSessionActive, setQrSessionActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qrSuggestions = useMemo<ColorSuggestion[]>(
    () =>
      (qrSession?.uploads ?? [])
        .filter(
          (
            upload,
          ): upload is typeof upload & {
            suggestedColorName: string
            suggestedColorHex: string
            sampledHex: string
          } =>
            Boolean(
              upload.suggestedColorName &&
              upload.suggestedColorHex &&
              upload.sampledHex,
            ),
        )
        .map((upload) => ({
          name: upload.suggestedColorName,
          hex: upload.suggestedColorHex,
          sampledHex: upload.sampledHex,
        })),
    [qrSession],
  )

  function applySuggestion(suggestion: ColorSuggestion | null) {
    if (!suggestion) return
    setColorName(suggestion.name)
    setColorHex(suggestion.hex)
    setSampledHex(suggestion.sampledHex)
  }

  function updateAssets(next: ReadonlyArray<ImageAsset>) {
    const normalized = [...next]
    setAssets(normalized)
    applySuggestion(
      combineColorSuggestions([
        ...normalized.map((asset) => asset.suggestion),
        ...qrSuggestions,
      ]),
    )
  }

  function updateQrSession(session: CompletedPhotoSession) {
    setQrSession(session)
    applySuggestion(
      combineColorSuggestions([
        ...assets.map((asset) => asset.suggestion),
        ...session.uploads.flatMap((upload) =>
          upload.suggestedColorName &&
          upload.suggestedColorHex &&
          upload.sampledHex
            ? [
                {
                  name: upload.suggestedColorName,
                  hex: upload.suggestedColorHex,
                  sampledHex: upload.sampledHex,
                },
              ]
            : [],
        ),
      ]),
    )
  }

  async function save() {
    setSubmitting(true)
    setError(null)
    try {
      const color = await addItemColor({
        data: { itemId, colorName, colorHex },
      })

      for (const asset of assets) {
        const { uploadUrl, s3Key } = await getItemImageUploadUrl({
          data: { itemColorId: color.id, contentType: 'image/jpeg' },
        })
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          body: asset.blob,
          headers: { 'Content-Type': 'image/jpeg' },
        })
        if (!response.ok) throw new Error(`Upload failed (${response.status})`)
        await attachUploadedItemColorImage({
          data: { itemColorId: color.id, imageS3Key: s3Key },
        })
      }

      if (qrSession) {
        await attachPhotoSessionImages({
          data: { token: qrSession.token, itemColorId: color.id },
        })
      }
      onCreated(color.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <ImageUploader
        onAssetsChange={updateAssets}
        onSuggestColor={applySuggestion}
        onEyedrop={applySuggestion}
      />
      <PhotoCapture
        itemId={itemId}
        onSessionCompleted={updateQrSession}
        onSessionStateChange={setQrSessionActive}
      />
      {qrSession && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {qrSession.uploads.length} phone photo
            {qrSession.uploads.length === 1 ? '' : 's'} ready to attach when you
            save.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {qrSession.uploads.map((upload, index) => (
              <img
                key={upload.id}
                src={upload.imageUrl}
                alt={`Phone photo ${index + 1}`}
                className="aspect-square rounded border object-cover"
              />
            ))}
          </div>
        </div>
      )}
      <ColorPicker
        colorName={colorName}
        colorHex={colorHex}
        onChange={({ colorName: nextName, colorHex: nextHex }) => {
          setColorName(nextName)
          setColorHex(nextHex)
        }}
        sampledHex={sampledHex}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {qrSessionActive && (
        <p className="text-xs text-muted-foreground">
          Finish the phone photo session before saving this color.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={!colorName || submitting || qrSessionActive}
        >
          {submitting ? 'Saving…' : 'Save color'}
        </Button>
      </div>
    </div>
  )
}
