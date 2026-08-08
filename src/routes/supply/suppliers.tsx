import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FieldLabel } from '#/components/ui/field-label'
import { Textarea } from '#/components/ui/textarea'
import { Combobox } from '#/components/ui/combobox'
import { COUNTRIES } from '#/lib/countries'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Badge } from '#/components/ui/badge'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  archiveSupplier,
  createSupplier,
  listSuppliers,
  restoreSupplier,
  updateSupplier,
} from '#/server/functions/supply/suppliers'

type SupplierRecord = {
  id: string
  name: string
  type: 'local' | 'international'
  country: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  notes: string | null
  deletedAt?: Date | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const Route = createFileRoute('/supply/suppliers')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: () => listSuppliers(),
  component: SuppliersPage,
})

function SuppliersPage() {
  const initialSuppliers = Route.useLoaderData()
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  async function handleArchive(supplier: SupplierRecord) {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return

    setMutationError(null)
    setDeletingId(supplier.id)
    try {
      await archiveSupplier({ data: { id: supplier.id } })
      await router.invalidate()
    } catch (error) {
      setMutationError(getErrorMessage(error))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestore(supplier: SupplierRecord) {
    setMutationError(null)
    try {
      await restoreSupplier({ data: { id: supplier.id } })
      await router.invalidate()
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage your local and international suppliers.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <SupplierForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {mutationError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {mutationError}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const next = !showArchived
          setShowArchived(next)
          void listSuppliers({ data: { includeArchived: next } }).then(
            setSuppliers,
          )
        }}
      >
        {showArchived ? 'Hide archived' : 'Search archived'}
      </Button>

      <Dialog
        open={editingSupplier !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingSupplier(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          {editingSupplier ? (
            <SupplierForm
              key={editingSupplier.id}
              supplier={editingSupplier}
              onSuccess={() => setEditingSupplier(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {suppliers.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          No suppliers yet. Add your first supplier to get started.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <span>{s.name}</span>{' '}
                    {s.deletedAt && <Badge variant="outline">Archived</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.type === 'international' ? 'default' : 'secondary'
                      }
                    >
                      {s.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.country ?? '-'}</TableCell>
                  <TableCell>{s.contactName ?? '-'}</TableCell>
                  <TableCell>{s.contactPhone ?? '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {s.deletedAt ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRestore(s)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${s.name}`}
                            onClick={() => {
                              setMutationError(null)
                              setEditingSupplier(s)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${s.name}`}
                            disabled={deletingId === s.id}
                            onClick={() => void handleArchive(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function SupplierForm({
  supplier,
  onSuccess,
}: {
  supplier?: SupplierRecord
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [country, setCountry] = useState(supplier?.country ?? '')
  const [type, setType] = useState<'local' | 'international'>(
    supplier?.type ?? 'international',
  )
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const isEditing = supplier !== undefined

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const values = {
      name: form.get('name') as string,
      type,
      country: country || undefined,
      contactName: (form.get('contactName') as string) || undefined,
      contactPhone: (form.get('contactPhone') as string) || undefined,
      contactEmail: (form.get('contactEmail') as string) || undefined,
      address: (form.get('address') as string) || undefined,
      notes: (form.get('notes') as string) || undefined,
    }

    try {
      if (supplier) {
        await updateSupplier({ data: { id: supplier.id, ...values } })
      } else {
        await createSupplier({ data: values })
      }
      await router.invalidate()
      onSuccess()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e)
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <FieldLabel htmlFor="name" help="supplier.name">
          Name *
        </FieldLabel>
        <Input id="name" name="name" defaultValue={supplier?.name} required />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="type" help="supplier.type">
          Type *
        </FieldLabel>
        <Select
          value={type}
          onValueChange={(value) => setType(value as 'local' | 'international')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="international">International</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="country" help="supplier.country">
          Country
        </FieldLabel>
        <Combobox
          id="country"
          options={COUNTRIES}
          value={country}
          onChange={setCountry}
          placeholder="Select country"
          searchPlaceholder="Search countries..."
          emptyMessage="No countries match."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="contactName" help="supplier.contactName">
            Contact Name
          </FieldLabel>
          <Input
            id="contactName"
            name="contactName"
            defaultValue={supplier?.contactName ?? ''}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="contactPhone" help="supplier.contactPhone">
            Phone
          </FieldLabel>
          <Input
            id="contactPhone"
            name="contactPhone"
            defaultValue={supplier?.contactPhone ?? ''}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="contactEmail" help="supplier.contactEmail">
          Email
        </FieldLabel>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={supplier?.contactEmail ?? ''}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="address">Address</FieldLabel>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={supplier?.address ?? ''}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="notes" help="supplier.notes">
          Notes
        </FieldLabel>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={supplier?.notes ?? ''}
        />
      </div>

      {error ? (
        <div role="alert" className="text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (isEditing ? 'Saving...' : 'Creating...') : null}
        {!pending && isEditing ? 'Save Changes' : null}
        {!pending && !isEditing ? 'Create Supplier' : null}
      </Button>
    </form>
  )
}
