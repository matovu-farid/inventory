import { createFileRoute, useRouter } from "@tanstack/react-router"
import * as React from "react"
import { requireUiPermission } from "#/lib/permissions"
import { getShopStock } from "#/server/functions/shop/sales"
import { getSession } from "#/server/middleware/auth"
import { aggregateStockByArticle } from "#/lib/products"
import { CartProvider } from "#/components/pos/cart-context"
import { PosLayout } from "#/components/pos/pos-layout"
import { PosHeader } from "#/components/pos/pos-header"
import { ProductGrid } from "#/components/pos/product-grid"
import { CartBar } from "#/components/pos/cart-bar"
import { CartSheet } from "#/components/pos/cart-sheet"
import { CheckoutSheet } from "#/components/pos/checkout-sheet"
import { VariantPickerSheet } from "#/components/pos/variant-picker-sheet"
import { QueuedSalesSheet } from "#/components/pos/queued-sales-sheet"
import { useSyncEngine } from "#/lib/offline/sync"
import { useOnline } from "#/lib/offline/use-online"
import type { AggregatedProduct } from "#/lib/products"

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => requireUiPermission(context, "pos.view"),
  loader: async () => {
    const session = await getSession()
    const user = session?.user as
      | { id?: string; name?: string; email?: string; shopId?: string | null }
      | undefined
    if (!user?.shopId) {
      throw new Error("No shop assigned to this user. Ask an admin to assign you a shop.")
    }
    const stock = await getShopStock({ data: { shopId: user.shopId } })
    return {
      shopId: user.shopId,
      userId: user.id ?? "anon",
      userName: user.name ?? "User",
      userEmail: user.email ?? "",
      stock,
    }
  },
  component: PosPage,
})

function PosPage() {
  const { shopId, userId } = Route.useLoaderData()
  return (
    <CartProvider storageKey={`pos-cart:${userId}:${shopId}`}>
      <PosInner />
    </CartProvider>
  )
}

function PosInner() {
  const { shopId, userName, userEmail, stock } = Route.useLoaderData()
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [picked, setPicked] = React.useState<AggregatedProduct | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [cartOpen, setCartOpen] = React.useState(false)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [queueOpen, setQueueOpen] = React.useState(false)

  const isOnline = useOnline()
  const { queued, failed, refresh } = useSyncEngine()


  const aggregated = React.useMemo(() => aggregateStockByArticle(stock), [stock])
  const stockRows = React.useMemo(
    () =>
      stock.map((s) => ({
        id: s.id,
        productColorId: s.productColorId,
        size: s.size,
        quantityOnHand: s.quantityOnHand,
        minimumSellPriceUgx: s.minimumSellPriceUgx,
      })),
    [stock],
  )

  function handlePick(p: AggregatedProduct) {
    setPicked(p)
    setPickerOpen(true)
  }

  function handleSaleComplete() {
    void router.invalidate()
  }

  function handleSyncComplete() {
    void refresh()
  }

  return (
    <PosLayout
      header={
        <PosHeader
          query={query}
          onQueryChange={setQuery}
          userName={userName}
          userEmail={userEmail}
          isOnline={isOnline}
          queued={queued}
          failed={failed}
          onOpenQueue={() => setQueueOpen(true)}
        />
      }
      footer={<CartBar onOpenCart={() => setCartOpen(true)} />}
    >
      <ProductGrid products={aggregated} query={query} onPick={handlePick} />

      <VariantPickerSheet
        product={picked}
        stock={stockRows}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
      />
      <CheckoutSheet
        shopId={shopId}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onSaleComplete={handleSaleComplete}
      />
      <QueuedSalesSheet
        open={queueOpen}
        onOpenChange={setQueueOpen}
        onSyncComplete={handleSyncComplete}
      />
    </PosLayout>
  )
}
