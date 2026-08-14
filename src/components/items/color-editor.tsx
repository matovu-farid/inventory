import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { ColorPicker } from './color-picker'
import { addItemColor } from '#/server/functions/items/colors'

interface Props {
  itemId: string
  onCreated: (itemColorId: string) => void
}

export function ColorEditor({ itemId, onCreated }: Props) {
  const [colorName, setColorName] = useState('')
  const [colorHex, setColorHex] = useState('#000000')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!colorName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const color = await addItemColor({
        data: { itemId, colorName: colorName.trim(), colorHex },
      })
      onCreated(color.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <ColorPicker
        colorName={colorName}
        colorHex={colorHex}
        onChange={({ colorName: nextName, colorHex: nextHex }) => {
          setColorName(nextName)
          setColorHex(nextHex)
        }}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={!colorName.trim() || submitting}
        >
          {submitting ? 'Saving…' : 'Save color'}
        </Button>
      </div>
    </div>
  )
}
