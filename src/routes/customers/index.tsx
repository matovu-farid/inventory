import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { Plus } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { FieldLabel } from "#/components/ui/field-label"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "#/components/ui/responsive-dialog"
import { DialogTrigger } from "#/components/ui/dialog"
import { ResponsiveTable } from "#/components/ui/responsive-table"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  listCustomers,
  createCustomer,
} from "#/server/functions/customers/customers"

export const Route = createFileRoute("/customers/")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "customers.view"),
  loader: async () => {
    const customers = await listCustomers()
    return { customers }
  },
  component: CustomersPage,
})

function CustomersPage() {
  const { customers } = Route.useLoaderData()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createCustomer({
        data: {
          name,
          phone: phone || undefined,
          notes: notes || undefined,
        },
      })
      setName("")
      setPhone("")
      setNotes("")
      setOpen(false)
      void router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            Customers used for credit sales. Cash and bank sales do not need a
            customer record.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { void handleCreate(e) }} className="space-y-4">
              <div className="space-y-2">
                <FieldLabel htmlFor="name" help="customer.name">Name</FieldLabel>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="phone" help="customer.phone">Phone (optional)</FieldLabel>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="notes" help="customer.notes">Notes (optional)</FieldLabel>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !name}>
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{customers.length} customer{customers.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            data={customers}
            getRowKey={(c) => c.id}
            columns={[
              {
                header: "Name",
                cell: (c) => <span className="font-medium">{c.name}</span>,
              },
              {
                header: "Phone",
                cell: (c) => c.phone ?? "—",
              },
              {
                header: "Notes",
                cell: (c) => (
                  <span className="text-muted-foreground">{c.notes ?? "—"}</span>
                ),
                hideOnMobile: true,
              },
              {
                header: "Added",
                cell: (c) => new Date(c.createdAt).toLocaleDateString(),
                hideOnMobile: true,
              },
            ]}
            emptyMessage="No customers yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}
