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
import type { AggregatedProduct } from "#/lib/products"

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => requireUiPermission(context, "pos.view"),
  loader: async () => {
    const session = await getSession()
    const user = session?.user as { name?: string; email?: string; shopId?: string | null } | undefined
    if (!user?.shopId) {
      throw new Error("No shop assigned to this user. Ask an admin to assign you a shop.")
    }
    const stock = await getShopStock({ data: { shopId: user.shopId } })
    return {
      shopId: user.shopId,
      userName: user.name ?? "User",
      userEmail: user.email ?? "",
      stock,
    }
  },
  component: PosPage,
})

function PosPage() {
  const { shopId } = Route.useLoaderData()
  return (
    <CartProvider storageKey={`pos-cart:${shopId}`}>
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
    router.invalidate()
  }

  return (
    <PosLayout
      header={<PosHeader query={query} onQueryChange={setQuery} userName={userName} userEmail={userEmail} />}
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
    </PosLayout>
  )
}
