// src/routes/settings/setup.tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { PrereqEmptyState } from "#/components/prerequisites/prereq-empty-state"
import { getSystemPrereqs } from "#/server/functions/prereqs/system"

export const Route = createFileRoute("/settings/setup")({
  loader: async () => {
    const summary = await getSystemPrereqs()
    return { summary }
  },
  component: SetupPage,
})

function SetupPage() {
  const { summary } = Route.useLoaderData()

  const hardItems = summary.items.filter((i) => i.severity === "hard")
  const softItems = summary.items.filter((i) => i.severity === "soft")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Setup Checklist</h1>
        <p className="text-muted-foreground">
          {summary.passing} of {summary.totalChecks} system checks passing.
        </p>
      </div>

      {hardItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold">
              {hardItems.length} blocking{" "}
              {hardItems.length === 1 ? "issue" : "issues"}
            </h2>
          </div>
          <PrereqEmptyState
            items={hardItems}
            heading="These need to be fixed"
            subtitle="Each item below blocks a page. Use the buttons to set them up."
            showPageLinks
          />
        </section>
      )}

      {softItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="size-4" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold">
              {softItems.length} suggestion
              {softItems.length === 1 ? "" : "s"}
            </h2>
          </div>
          <PrereqEmptyState
            items={softItems}
            heading="Optional improvements"
            subtitle="These don't block anything but will make the system more useful."
            showPageLinks
          />
        </section>
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
    </div>
  )
}
