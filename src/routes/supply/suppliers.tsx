import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Badge } from "#/components/ui/badge"
import { Plus } from "lucide-react"
import {
  listSuppliers,
  createSupplier,
} from "#/server/functions/supply/suppliers"

export const Route = createFileRoute("/supply/suppliers")({
  loader: () => listSuppliers(),
  component: SuppliersPage,
})

function SuppliersPage() {
  const suppliers = Route.useLoaderData()
  const [open, setOpen] = useState(false)

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
            <CreateSupplierForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant={s.type === "international" ? "default" : "secondary"}>
                      {s.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.country ?? "-"}</TableCell>
                  <TableCell>{s.contactName ?? "-"}</TableCell>
                  <TableCell>{s.contactPhone ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CreateSupplierForm({ onSuccess }: { onSuccess: () => void }) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)

    const form = new FormData(e.currentTarget)
    try {
      await createSupplier({
        data: {
          name: form.get("name") as string,
          type: form.get("type") as "local" | "international",
          country: (form.get("country") as string) || undefined,
          contactName: (form.get("contactName") as string) || undefined,
          contactPhone: (form.get("contactPhone") as string) || undefined,
          contactEmail: (form.get("contactEmail") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
        },
      })
      router.invalidate()
      onSuccess()
    } catch (err) {
      console.error("Failed to create supplier:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type *</Label>
        <Select name="type" defaultValue="international">
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
        <Label htmlFor="country">Country</Label>
        <Input id="country" name="country" placeholder="e.g., China" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contactName">Contact Name</Label>
          <Input id="contactName" name="contactName" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Phone</Label>
          <Input id="contactPhone" name="contactPhone" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactEmail">Email</Label>
        <Input id="contactEmail" name="contactEmail" type="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create Supplier"}
      </Button>
    </form>
  )
}
