import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { updateItem } from '#/server/functions/items/items'
import { InfoPopover } from '#/components/ui/info-popover'

interface Props {
  itemId: string
  current: string
  canEdit: boolean
  onSaved: () => void
}

export function DesignEditPopover({
  itemId,
  current,
  canEdit,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(current)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const next = draft.trim()
    if (!next || next === current) {
      setOpen(false)
      return
    }
    setPending(true)
    setError(null)
    try {
      await updateItem({ data: { id: itemId, design: next } })
      setOpen(false)
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Failed to update design.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Badge variant="secondary">{current}</Badge>
      {canEdit && (
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen)
            if (nextOpen) {
              setDraft(current)
              setError(null)
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Edit design"
            >
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Design
              <InfoPopover term="item.design" ariaLabel="What is Design?" />
            </p>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Round neck"
            />
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={pending || !draft.trim()}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
