import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
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
import { getVisibleSuppliers } from '#/lib/supplier-list'
import {
  archiveSupplier,
  listSuppliers,
  restoreSupplier,
} from '#/server/functions/supply/suppliers'
import { SupplierForm } from '#/components/supply/supplier-form'
import type { SupplierFormRecord } from '#/components/supply/supplier-form'

type SupplierRecord = SupplierFormRecord

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const Route = createFileRoute('/supply/suppliers')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: () => listSuppliers(),
  component: SuppliersPage,
})

function SuppliersPage() {
  const activeSuppliers = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedSuppliers, setArchivedSuppliers] = useState<
    typeof activeSuppliers | null
  >(null)
  const suppliers = getVisibleSuppliers(
    activeSuppliers,
    archivedSuppliers,
    showArchived,
  )

  async function refreshArchivedSuppliers() {
    if (!showArchived) return

    try {
      setArchivedSuppliers(
        await listSuppliers({ data: { includeArchived: true } }),
      )
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  async function handleArchive(supplier: SupplierRecord) {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return

    setMutationError(null)
    setDeletingId(supplier.id)
    try {
      await archiveSupplier({ data: { id: supplier.id } })
      await router.invalidate()
      await refreshArchivedSuppliers()
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
      await refreshArchivedSuppliers()
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
            <SupplierForm
              onSuccess={async () => {
                await router.invalidate()
                setOpen(false)
                void refreshArchivedSuppliers()
              }}
            />
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
          setMutationError(null)
          if (next) {
            void listSuppliers({ data: { includeArchived: true } })
              .then(setArchivedSuppliers)
              .catch((error) => setMutationError(getErrorMessage(error)))
          } else {
            setArchivedSuppliers(null)
          }
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
              onSuccess={async () => {
                await router.invalidate()
                setEditingSupplier(null)
                void refreshArchivedSuppliers()
              }}
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
