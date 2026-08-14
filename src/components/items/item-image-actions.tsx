import { useState } from 'react'
import { Images } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { PhotoCapture } from './photo-handoff-qr'
import type { PhotoUploadResult } from './photo-handoff-qr'

interface Props {
  itemId: string
  onUploaded: (uploads: PhotoUploadResult[]) => void
}

export function ItemImageActions({ itemId, onUploaded }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" onClick={() => setOpen(true)}>
        <Images className="size-4" aria-hidden="true" />
        Add images
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add item images</DialogTitle>
          <DialogDescription>
            Add several photos at once. They will be available for color
            detection across the whole item.
          </DialogDescription>
        </DialogHeader>
        <PhotoCapture
          itemId={itemId}
          onUploaded={(uploads) => {
            onUploaded(uploads)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
