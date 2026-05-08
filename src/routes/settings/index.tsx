import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react"
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
import { PrereqEmptyState } from "#/components/prerequisites/prereq-empty-state"
import {
  listShops,
  ensureStore,
} from "#/server/functions/admin/locations"
import { getSystemPrereqs } from "#/server/functions/prereqs/system"

export const Route = createFileRoute("/settings/")({
  loader: async () => {
    const [store, shops, summary] = await Promise.all([
      ensureStore(),
      listShops(),
      getSystemPrereqs(),
    ])
    return { store, shops, summary }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { store, shops, summary } = Route.useLoaderData()

  const hardItems = summary.items.filter((i) => i.severity === "hard")
  const softItems = summary.items.filter((i) => i.severity === "soft")

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Setup Checklist */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Setup Checklist</h2>
          <p className="text-sm text-muted-foreground">
            {summary.passing} of {summary.totalChecks} system checks passing.
          </p>
        </div>

        {hardItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">
                {hardItems.length} blocking{" "}
                {hardItems.length === 1 ? "issue" : "issues"}
              </h3>
            </div>
            <PrereqEmptyState
              items={hardItems}
              heading="These need to be fixed"
              subtitle="Each item below blocks a page. Use the buttons to set them up."
              showPageLinks
            />
          </div>
        )}

        {softItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="size-4" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">
                {softItems.length} suggestion
                {softItems.length === 1 ? "" : "s"}
              </h3>
            </div>
            <PrereqEmptyState
              items={softItems}
              heading="Optional improvements"
              subtitle="These don't block anything but will make the system more useful."
              showPageLinks
            />
          </div>
        )}

        {summary.satisfiedPages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="size-4" strokeWidth={1.75} />
                All set ({summary.satisfiedPages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {summary.satisfiedPages.map((p) => (
                  <li key={p.pageHref}>
                    <Link
                      to={p.pageHref}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {p.pageLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <Separator />

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

        {shops.length > 0 && (
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
