import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { z } from "zod"
import { requireUiPermission } from "#/lib/permissions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { FieldLabel } from "#/components/ui/field-label"
import { InfoTip } from "#/components/ui/info-tip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  listItemCategories,
  createItemCategory,
  renameItemCategory,
  deleteItemCategory,
} from "#/server/functions/admin/item-categories"

type Row = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export const Route = createFileRoute("/settings/categories")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "itemCategories.manage"),
  loader: async () => {
    const rows = await listItemCategories()
    return { rows: rows as Row[] }
  },
  component: CategoriesPage,
})

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be 100 characters or fewer")

function CategoriesPage() {
  const { rows } = Route.useLoaderData()
  const router = useRouter()

  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>()
  const [createPending, setCreatePending] = useState(false)

  const [renameTarget, setRenameTarget] = useState<Row | null>(null)
  const [renamePending, setRenamePending] = useState(false)
  const [renameError, setRenameError] = useState<string | undefined>()

  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleCreate(name: string) {
    setCreateError(undefined)
    setCreatePending(true)
    try {
      await createItemCategory({ data: { name } })
      setCreateOpen(false)
      void router.invalidate()
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create category",
      )
    } finally {
      setCreatePending(false)
    }
  }

  async function handleRename(name: string) {
    if (!renameTarget) return
    setRenameError(undefined)
    setRenamePending(true)
    try {
      await renameItemCategory({ data: { id: renameTarget.id, name } })
      setRenameTarget(null)
      void router.invalidate()
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Failed to rename category",
      )
    } finally {
      setRenamePending(false)
    }
  }

  async function handleDelete(row: Row) {
    if (!confirm(`Delete category "${row.name}"?`)) return
    setDeletingId(row.id)
    try {
      await deleteItemCategory({ data: { id: row.id } })
      void router.invalidate()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete category")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Item categories</h1>
        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next)
            if (!next) setCreateError(undefined)
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="new-category-button">New category</Button>
          </DialogTrigger>
          <NameDialog
            title="New category"
            description="Categories group products in the catalog. Each name must be unique."
            submitLabel="Create"
            open={createOpen}
            pending={createPending}
            error={createError}
            onSubmit={(v) => {
              void handleCreate(v)
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All categories</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categories yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Name <InfoTip term="category.name" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid={`category-row-${r.name}`}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRenameTarget(r)}
                        data-testid={`rename-${r.name}`}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleDelete(r)
                        }}
                        disabled={deletingId === r.id}
                        data-testid={`delete-${r.name}`}
                      >
                        {deletingId === r.id ? "Deleting..." : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRenameTarget(null)
            setRenameError(undefined)
          }
        }}
      >
        {renameTarget && (
          <NameDialog
            title={`Rename "${renameTarget.name}"`}
            description="Pick a new name for this category."
            submitLabel="Save"
            open
            pending={renamePending}
            error={renameError}
            initialValue={renameTarget.name}
            onSubmit={(v) => {
              void handleRename(v)
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function NameDialog({
  title,
  description,
  submitLabel,
  open,
  pending,
  error,
  initialValue = "",
  onSubmit,
}: {
  title: string
  description: string
  submitLabel: string
  open: boolean
  pending: boolean
  error?: string
  initialValue?: string
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialValue)

  useEffect(() => {
    if (open) setName(initialValue)
  }, [open, initialValue])

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = nameSchema.safeParse(name.trim())
    if (!parsed.success) return
    onSubmit(parsed.data)
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <FieldLabel htmlFor="category-name" help="category.name">
            Name
          </FieldLabel>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            data-testid="category-name-input"
          />
        </div>
        <DialogFooter>
          <Button
            type="submit"
            disabled={pending || name.trim().length === 0}
            data-testid="submit-category"
          >
            {pending ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
