import { useState } from "react"
import { Button } from "#/components/ui/button"
import { ColorPicker } from "./color-picker"
import { ImageUploader } from "./image-uploader"
import { addProductColor, setProductColorImage } from "#/server/functions/products/colors"
import { getProductImageUploadUrl } from "#/server/functions/products/uploads"

interface Props { productId: string; onCreated: (productColorId: string) => void }

export function ColorEditor({ productId, onCreated }: Props) {
  const [colorName, setColorName] = useState("")
  const [colorHex, setColorHex] = useState("#000000")
  const [sampledHex, setSampledHex] = useState<string | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    setSubmitting(true)
    try {
      const color = await addProductColor({ data: { productId, colorName, colorHex } })
      if (pendingBlob) {
        const { uploadUrl, s3Key } = await getProductImageUploadUrl({
          data: { productColorId: color.id, contentType: "image/jpeg" },
        })
        const res = await fetch(uploadUrl, { method: "PUT", body: pendingBlob, headers: { "Content-Type": "image/jpeg" } })
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
        await setProductColorImage({ data: { id: color.id, imageS3Key: s3Key } })
      }
      onCreated(color.id)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <ImageUploader
        onBlobReady={setPendingBlob}
        onSuggestColor={({ name, hex, sampledHex }) => {
          setColorName(name); setColorHex(hex); setSampledHex(sampledHex)
        }}
        onEyedrop={({ name, hex, sampledHex }) => {
          setColorName(name); setColorHex(hex); setSampledHex(sampledHex)
        }}
      />
      <ColorPicker
        colorName={colorName}
        colorHex={colorHex}
        onChange={({ colorName, colorHex }) => { setColorName(colorName); setColorHex(colorHex) }}
        sampledHex={sampledHex}
      />
      <div className="flex justify-end">
        <Button onClick={save} disabled={!colorName || submitting}>
          {submitting ? "Saving…" : "Save color"}
        </Button>
      </div>
    </div>
  )
}
