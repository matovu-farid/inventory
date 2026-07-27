import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FieldLabel } from '#/components/ui/field-label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { createShop } from '#/server/functions/admin/locations'

interface CreatedShop {
  id: string
  name: string
  location: string | null
}

interface AddShopDialogProps {
  /** Called after a successful create so the caller can refresh data and react. */
  onCreated?: (shop: CreatedShop) => void
}

export function AddShopDialog({ onCreated }: AddShopDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add Shop
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Shop</DialogTitle>
        </DialogHeader>
        <AddShopForm
          onSuccess={(shop) => {
            setOpen(false)
            onCreated?.(shop)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddShopForm({
  onSuccess,
}: {
  onSuccess: (shop: CreatedShop) => void
}) {
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const form = new FormData(e.currentTarget)
    try {
      const created = await createShop({
        data: {
          name: form.get('name') as string,
          location: (form.get('location') as string) || undefined,
        },
      })
      onSuccess({
        id: created.id,
        name: created.name,
        location: created.location,
      })
    } catch (err) {
      console.error('Failed to create shop:', err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor="name" help="shop.name">
          Shop Name *
        </FieldLabel>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="location" help="shop.location">
          Location
        </FieldLabel>
        <Input id="location" name="location" placeholder="e.g., Kampala" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating...' : 'Create Shop'}
      </Button>
    </form>
  )
}
