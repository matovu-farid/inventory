import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { CreatableCombobox } from '#/components/ui/creatable-combobox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { updateItem } from '#/server/functions/items/items'
import { InfoTip } from '#/components/ui/info-tip'

interface Props {
  itemId: string
  articleNumber: string
  name: string
  current: string
  categories: ReadonlyArray<string>
  canEdit: boolean
  onSaved: () => void
}

/**
 * Renders the item's category as a Badge. When `canEdit`, a pencil
 * button next to it opens a popover with a CreatableCombobox + Save /
 * Cancel. Save posts updateItem and calls onSaved() so the route can
 * invalidate.
 */
export function CategoryEditPopover({
  itemId,
  articleNumber,
  name,
  current,
  categories,
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
      await updateItem({
        data: {
          id: itemId,
          articleNumber,
          name,
          category: next,
        },
      })
      setOpen(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update category.')
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
          onOpenChange={(o) => {
            setOpen(o)
            if (o) {
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
              aria-label="Edit category"
            >
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Category
              <InfoTip term="itemForm.category" ariaLabel="What is Category?" />
            </p>
            <CreatableCombobox
              options={categories}
              value={draft}
              onChange={setDraft}
              placeholder="Pick or type a category"
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
