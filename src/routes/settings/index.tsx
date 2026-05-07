import { createFileRoute } from "@tanstack/react-router"
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
import {
  listShops,
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

      {/* Shops (read-only summary; create/seed live on the Shop page) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Shops</h2>

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
