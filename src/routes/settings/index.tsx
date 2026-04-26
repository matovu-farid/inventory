import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
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
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import { Plus } from "lucide-react"
import {
  listShops,
  createShop,
  ensureStore,
} from "#/server/functions/admin/locations"

export const Route = createFileRoute("/settings/")({
  loader: async () => {
    const [store, shops] = await Promise.all([
      ensureStore(),
      listShops(),
    ])
    return { store, shops }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { store, shops } = Route.useLoaderData()
  const [shopOpen, setShopOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Store */}
      <Card>
        <CardHeader>
          <CardTitle>Warehouse</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            <span className="font-medium">{store.name}</span>
            {store.location && (
              <span className="text-muted-foreground ml-2">
                — {store.location}
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Shops */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Shops</h2>
          <Dialog open={shopOpen} onOpenChange={setShopOpen}>
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
                onSuccess={() => {
                  setShopOpen(false)
                  router.invalidate()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {shops.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No shops configured yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.location ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

function AddShopForm({ onSuccess }: { onSuccess: () => void }) {
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const form = new FormData(e.currentTarget)
    try {
      await createShop({
        data: {
          name: form.get("name") as string,
          location: (form.get("location") as string) || undefined,
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to create shop:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Shop Name *</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" placeholder="e.g., Kampala" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create Shop"}
      </Button>
    </form>
  )
}
