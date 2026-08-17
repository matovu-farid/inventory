import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { SupplierForm } from './supplier-form'

export interface CreatedSupplierOption {
  id: string
  name: string
}

interface Props {
  open: boolean
  initialName: string
  onOpenChange: (open: boolean) => void
  onCreated: (supplier: CreatedSupplierOption) => void
}

export function CreateSupplierDialog({
  open,
  initialName,
  onOpenChange,
  onCreated,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create supplier</DialogTitle>
          <DialogDescription>
            Add the supplier details before continuing with this item.
          </DialogDescription>
        </DialogHeader>
        <SupplierForm
          initialName={initialName}
          idPrefix="create-supplier"
          onCancel={() => onOpenChange(false)}
          onSuccess={(supplier) => {
            onOpenChange(false)
            onCreated({ id: supplier.id, name: supplier.name })
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
