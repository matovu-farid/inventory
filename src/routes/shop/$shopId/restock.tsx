import { createFileRoute, useRouter } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { listShopRestockSuggestions } from "#/server/functions/shop/restock-suggestions"
import { getShop } from "#/server/functions/shop/list-shops"
import { createTransfer } from "#/server/functions/store/transfers"
import {
  RestockSuggestionsTable,
  type SuggestionRow,
  type SuggestionSelection,
} from "#/components/notifications/restock-suggestions-table"
import { z } from "zod"

const search = z.object({ variant: z.string().optional() })

export const Route = createFileRoute("/shop/$shopId/restock")({
  beforeLoad: ({ context }) => requireUiPermission(context, "notifications.manage"),
  validateSearch: search,
  loaderDeps: ({ search }) => ({ variant: search.variant }),
  loader: async ({ params }) => {
    const [shop, suggestions] = await Promise.all([
      getShop({ data: { id: params.shopId } }),
      listShopRestockSuggestions({ data: { shopId: params.shopId } }),
    ])
    return { shop, suggestions }
  },
  component: ShopRestockPage,
})

type Banner = { kind: "success" | "error"; text: string }

function ShopRestockPage() {
  const { shop, suggestions } = Route.useLoaderData() as {
    shop: { id: string; name: string }
    suggestions: SuggestionRow[]
  }
  const { variant } = Route.useSearch()
  const router = useRouter()
  const params = Route.useParams() as { shopId: string }
  const [banner, setBanner] = useState<Banner | null>(null)

  async function onSubmit(selections: SuggestionSelection[]) {
    if (selections.length === 0) {
      setBanner({ kind: "error", text: "Select at least one item." })
      return
    }
    setBanner(null)
    try {
      await createTransfer({
        data: {
          shopId: params.shopId,
          items: selections.map((s) => ({
            storeStockId: s.storeStockId,
            quantityDispatched: s.quantity,
          })),
        },
      })
      setBanner({
        kind: "success",
        text: `Transfer dispatched with ${selections.length} item${selections.length === 1 ? "" : "s"}.`,
      })
      await router.invalidate()
      router.navigate({ to: "/store/transfers" })
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to create transfer.",
      })
    }
  }

  return (
    <div className="container max-w-5xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Restock — {shop.name}</h1>
      {banner && (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm px-3 py-2"
              : "rounded-md border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2"
          }
        >
          {banner.text}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Currently low</CardTitle>
          <CardDescription>
            These items are below threshold. Tick the ones to dispatch from the
            warehouse, adjust quantities, and create a single transfer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestockSuggestionsTable
            rows={suggestions}
            preselectVariantId={variant}
            onSubmit={onSubmit}
          />
        </CardContent>
      </Card>
    </div>
  )
}
