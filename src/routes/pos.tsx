import { createFileRoute, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { requireUiPermission } from '#/lib/permissions'
import { getShopStock } from '#/server/functions/shop/sales'
import { getSession } from '#/server/middleware/auth'
import { aggregateStockByArticle } from '#/lib/items'
import { CartProvider } from '#/components/pos/cart-context'
import { PosLayout } from '#/components/pos/pos-layout'
import { PosHeader } from '#/components/pos/pos-header'
import { ItemGrid } from '#/components/pos/item-grid'
import { CartBar } from '#/components/pos/cart-bar'
import { CartSheet } from '#/components/pos/cart-sheet'
import { CheckoutSheet } from '#/components/pos/checkout-sheet'
import { VariantPickerSheet } from '#/components/pos/variant-picker-sheet'
import { QueuedSalesSheet } from '#/components/pos/queued-sales-sheet'
import { useSyncEngine } from '#/lib/offline/sync'
import { useOnline } from '#/lib/offline/use-online'
import type { AggregatedItem } from '#/lib/items'

export const Route = createFileRoute('/pos')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'pos.view'),
  loader: async () => {
    const session = await getSession()
    const user = session?.user as
      | { id?: string; name?: string; email?: string; shopId?: string | null }
      | undefined
    if (!user?.shopId) {
      throw new Error(
        'No shop assigned to this user. Ask an admin to assign you a shop.',
      )
    }
    const stock = await getShopStock({ data: { shopId: user.shopId } })
    return {
      shopId: user.shopId,
      userId: user.id ?? 'anon',
      userName: user.name ?? 'User',
      userEmail: user.email ?? '',
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
  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<AggregatedItem | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [cartOpen, setCartOpen] = React.useState(false)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [queueOpen, setQueueOpen] = React.useState(false)

  const isOnline = useOnline()
  const { queued, failed, refresh } = useSyncEngine()

  // Filter out unresolved (variant_id NULL) shop_stock rows for the
  // touch POS surface. The variant-picker UI is variant-scoped by
  // design; the admin-side New Sale dialog in /shop is where Plan 2b's
  // item-level recordSale handles unresolved lots directly.
  const resolved = React.useMemo(
    () =>
      stock.filter(
        (s): s is typeof s & { variant: NonNullable<typeof s.variant> } =>
          s.variant !== null,
      ),
    [stock],
  )
  const aggregated = React.useMemo(
    () => aggregateStockByArticle(resolved),
    [resolved],
  )
  const stockRows = React.useMemo(
    () =>
      resolved.map((s) => ({
        id: s.id,
        // Item identity for Plan 2b's item-level recordSale input.
        itemId: s.itemId,
        variantId: s.variantId,
        // Stock now keys on variant_id (issue #4). The variant picker UI
        // still groups rows by (color × size); expose the variant's
        // colorId + size so its existing data shape stays intact.
        itemColorId: s.variant.color.id,
        size: s.variant.size,
        quantityOnHand: s.quantityOnHand,
        // Min sell price moved from shop_stock to items in the schema flip.
        minimumSellPriceUgx: s.item.minimumSellPriceUgx,
      })),
    [resolved],
  )

  function handlePick(p: AggregatedItem) {
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
      <ItemGrid items={aggregated} query={query} onPick={handlePick} />

      <VariantPickerSheet
        item={picked}
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
