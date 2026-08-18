import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, sql } from 'drizzle-orm'
import * as schema from './schema'
import {
  items,
  itemArticleNumbers,
  itemColors,
  suppliers,
  stores,
  shops,
  supplyRoutes,
  supplyRouteLines,
  storeStock,
  variants,
} from './schema'

const DEFAULT_CATEGORIES = [
  // Assets
  { name: 'Cash', type: 'asset' },
  { name: 'Bank', type: 'asset' },
  { name: 'Inventory - Store', type: 'asset' },
  { name: 'Inventory - Shop', type: 'asset' },
  { name: 'Accounts Receivable', type: 'asset' },
  { name: 'Due from Shop', type: 'asset' },

  // Liabilities
  { name: 'Supplier Payable', type: 'liability' },
  { name: 'Due to Store', type: 'liability' },

  // Equity
  { name: "Owner's Equity", type: 'equity' },

  // Revenue
  { name: 'Sales Revenue', type: 'revenue' },
  { name: 'Sales Returns', type: 'revenue' },
  { name: 'Store Transfer Revenue', type: 'revenue' },

  // Expenses
  { name: 'Cost of Goods Sold', type: 'expense' },
  { name: 'Freight Expense', type: 'expense' },
  { name: 'Transportation Expense', type: 'expense' },
  { name: 'Customs Expense', type: 'expense' },
  { name: 'Travel Expense', type: 'expense' },
  { name: 'Rent Expense', type: 'expense' },
  { name: 'Salary Expense', type: 'expense' },
  { name: 'Tax Expense', type: 'expense' },
  { name: 'Inventory Loss', type: 'expense' },
  { name: 'Bad Debt Expense', type: 'expense' },
  { name: 'Miscellaneous Expense', type: 'expense' },
] as const

async function seed() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  const db = drizzle(client, { schema })

  try {
    // ─── 1. Transaction categories (idempotent) ────────────────────────
    console.log('Seeding transaction categories...')
    for (const cat of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO transaction_categories (name, type, is_default)
         VALUES ($1, $2, true)
         ON CONFLICT DO NOTHING`,
        [cat.name, cat.type],
      )
    }
    console.log(`  ${DEFAULT_CATEGORIES.length} transaction categories.`)

    // ─── 2. Suppliers, stores, shops (idempotent on natural keys) ──────
    console.log('Seeding suppliers, stores, and shops...')
    const insertedSuppliers = await db
      .insert(suppliers)
      .values({
        name: 'Guangzhou Mei Da Trading Co.',
        type: 'international',
        country: 'China',
        contactName: 'Mr. Li Wei',
      })
      .onConflictDoNothing({ target: suppliers.name })
      .returning()

    // .returning() may yield an empty array when onConflictDoNothing skips the
    // insert. The drizzle types claim a non-empty tuple here, so we widen via
    // .pop() (which returns T | undefined) before consulting the DB.
    const inserted = insertedSuppliers.slice().pop()
    const existingSupplier =
      inserted ??
      (await db.query.suppliers.findFirst({
        where: eq(suppliers.name, 'Guangzhou Mei Da Trading Co.'),
      }))

    if (!existingSupplier) {
      throw new Error('Failed to create or find seed supplier')
    }
    const seedSupplierId = existingSupplier.id

    // Stores / shops don't have unique constraints on name, so we look first.
    let store = await db.query.stores.findFirst({
      where: eq(stores.name, 'Central Warehouse'),
    })
    if (!store) {
      ;[store] = await db
        .insert(stores)
        .values({ name: 'Central Warehouse', location: 'Kampala' })
        .returning()
    }

    let shopA = await db.query.shops.findFirst({
      where: eq(shops.name, 'Owino Branch'),
    })
    if (!shopA) {
      ;[shopA] = await db
        .insert(shops)
        .values({ name: 'Owino Branch', location: 'Kampala' })
        .returning()
    }

    let shopB = await db.query.shops.findFirst({
      where: eq(shops.name, 'Nakawa Branch'),
    })
    if (!shopB) {
      ;[shopB] = await db
        .insert(shops)
        .values({ name: 'Nakawa Branch', location: 'Kampala' })
        .returning()
    }
    console.log(`  1 supplier, 1 store, 2 shops.`)

    // ─── 3. Products + colors ──────────────────────────────────────────
    console.log('Seeding products and color variants...')

    // `sizes` is no longer a column on items (issue #7 drops items.sizes
    // — the variants table is the source of truth). The seed still
    // accepts it so the stock-seed block below can keep using the same
    // declarative list of sizes when materialising variants.
    async function upsertProduct(args: {
      articleNumber: string
      name: string
      design: string
      sizes: string[]
      costPrice: string
      minimumSellPriceUgx: string
    }) {
      const existing = await db.query.items.findFirst({
        where: eq(items.name, args.name),
        with: { articleNumbers: true },
      })
      if (existing) return existing
      const [created] = await db
        .insert(items)
        .values({
          name: args.name,
          design: args.design,
          supplierId: seedSupplierId,
          costPrice: args.costPrice,
          costCurrency: 'RMB',
          minimumSellPriceUgx: args.minimumSellPriceUgx,
        })
        .returning()
      await db.insert(itemArticleNumbers).values({
        itemId: created.id,
        articleNumber: args.articleNumber,
      })
      return created
    }

    const tshirt = await upsertProduct({
      articleNumber: 'TR-001',
      name: 'Crew-neck T-shirt',
      design: 'Round neck',
      sizes: ['S', 'M', 'L'],
      costPrice: '85.00',
      minimumSellPriceUgx: '80000.00',
    })
    const jacket = await upsertProduct({
      articleNumber: 'JK-100',
      name: 'Bomber Jacket',
      design: 'Bomber',
      sizes: ['M', 'L', 'XL'],
      costPrice: '320.00',
      minimumSellPriceUgx: '300000.00',
    })
    const trouser = await upsertProduct({
      articleNumber: 'PT-200',
      name: 'Chino Trousers',
      design: 'Straight leg',
      sizes: ['30', '32', '34'],
      costPrice: '140.00',
      minimumSellPriceUgx: '140000.00',
    })

    async function upsertColor(args: {
      itemId: string
      colorName: string
      colorHex: string
    }) {
      const existing = await db.query.itemColors.findFirst({
        where: sql`${itemColors.itemId} = ${args.itemId} AND ${itemColors.colorName} = ${args.colorName}`,
      })
      if (existing) return existing
      const [created] = await db
        .insert(itemColors)
        .values({
          itemId: args.itemId,
          colorName: args.colorName,
          colorHex: args.colorHex,
          imageS3Key: null,
        })
        .returning()
      return created
    }

    const tshirtBlack = await upsertColor({
      itemId: tshirt.id,
      colorName: 'Black',
      colorHex: '#0a0a0a',
    })
    const tshirtBurgundy = await upsertColor({
      itemId: tshirt.id,
      colorName: 'Burgundy',
      colorHex: '#7b1f2b',
    })
    const jacketNavy = await upsertColor({
      itemId: jacket.id,
      colorName: 'Navy',
      colorHex: '#0b1f44',
    })
    const jacketOlive = await upsertColor({
      itemId: jacket.id,
      colorName: 'Olive',
      colorHex: '#6a6a2a',
    })
    const trouserKhaki = await upsertColor({
      itemId: trouser.id,
      colorName: 'Khaki',
      colorHex: '#b5a26b',
    })

    console.log(`  3 products, 5 color variants.`)

    // ─── 4. Supply route + variant items ───────────────────────────────
    console.log('Seeding supply route...')

    const routeName = 'China Trip — Seed Demo'
    const existingRoute = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.name, routeName),
    })
    const route =
      existingRoute ??
      (
        await db
          .insert(supplyRoutes)
          .values({
            name: routeName,
            status: 'received',
            rateUgxPerUsd: '3750',
            rateRmbPerUsd: '7.25',
            notes: 'Auto-generated by db:seed for dev/demo.',
          })
          .returning()
      ).at(0)
    if (!route) throw new Error('Failed to seed supply route')

    if (!existingRoute) {
      // One row per (color, size).
      type RouteItemSeed = {
        itemColorId: string
        size: string
        quantity: number
        unitPriceForeign: string
      }
      const routeItemSeeds: RouteItemSeed[] = [
        // T-shirts: 85 RMB
        ...['S', 'M', 'L'].flatMap((size): RouteItemSeed[] => [
          {
            itemColorId: tshirtBlack.id,
            size,
            quantity: 20,
            unitPriceForeign: '85.00',
          },
          {
            itemColorId: tshirtBurgundy.id,
            size,
            quantity: 15,
            unitPriceForeign: '85.00',
          },
        ]),
        // Jackets: 320 RMB
        ...['M', 'L', 'XL'].flatMap((size): RouteItemSeed[] => [
          {
            itemColorId: jacketNavy.id,
            size,
            quantity: 10,
            unitPriceForeign: '320.00',
          },
          {
            itemColorId: jacketOlive.id,
            size,
            quantity: 8,
            unitPriceForeign: '320.00',
          },
        ]),
        // Trousers: 140 RMB
        ...['30', '32', '34'].map(
          (size): RouteItemSeed => ({
            itemColorId: trouserKhaki.id,
            size,
            quantity: 12,
            unitPriceForeign: '140.00',
          }),
        ),
      ]

      const rmbPerUsd = 7.25
      const ugxPerUsd = 3750
      const rows = routeItemSeeds.map((s) => {
        const unitForeign = Number(s.unitPriceForeign)
        const totalForeign = unitForeign * s.quantity
        const totalUsd = totalForeign / rmbPerUsd
        const totalUgx = totalUsd * ugxPerUsd
        return {
          supplyRouteId: route.id,
          supplierId: existingSupplier.id,
          colorId: s.itemColorId,
          size: s.size,
          quantity: s.quantity,
          unitPriceForeign: s.unitPriceForeign,
          foreignCurrency: 'RMB',
          exchangeRateForeignToUsd: rmbPerUsd.toFixed(6),
          exchangeRateUsdToUgx: ugxPerUsd.toFixed(2),
          totalAmountForeign: totalForeign.toFixed(2),
          totalAmountUsd: totalUsd.toFixed(2),
          totalCostUgx: totalUgx.toFixed(2),
          minimumSellPriceUgx:
            s.itemColorId === tshirtBlack.id ||
            s.itemColorId === tshirtBurgundy.id
              ? tshirt.minimumSellPriceUgx
              : s.itemColorId === jacketNavy.id ||
                  s.itemColorId === jacketOlive.id
                ? jacket.minimumSellPriceUgx
                : trouser.minimumSellPriceUgx,
        }
      })
      await db.insert(supplyRouteLines).values(rows)
      console.log(`  1 supply route, ${rows.length} variant items.`)
    } else {
      console.log(`  supply route already seeded; skipping.`)
    }

    // ─── 5. Store opening stock (one row per variant) ──────────────────
    console.log('Seeding store stock...')
    const stockSeeds: Array<{
      itemColorId: string
      size: string
      qty: number
      costUgx: string
    }> = [
      // T-shirts ~ 44k UGX cost, sell floor 80k
      ...['S', 'M', 'L'].flatMap((size) => [
        { itemColorId: tshirtBlack.id, size, qty: 20, costUgx: '44000.00' },
        { itemColorId: tshirtBurgundy.id, size, qty: 15, costUgx: '44000.00' },
      ]),
      // Jackets ~ 165k UGX cost
      ...['M', 'L', 'XL'].flatMap((size) => [
        { itemColorId: jacketNavy.id, size, qty: 10, costUgx: '165500.00' },
        { itemColorId: jacketOlive.id, size, qty: 8, costUgx: '165500.00' },
      ]),
      // Trousers ~ 72k UGX cost
      ...['30', '32', '34'].map((size) => ({
        itemColorId: trouserKhaki.id,
        size,
        qty: 12,
        costUgx: '72400.00',
      })),
    ]

    // Seed needs a variant_id per stock row (issue #4). The variants
    // table used to be backfilled from (item_colors × items.sizes), but
    // issue #7 dropped items.sizes — the variants table is now the
    // source of truth for an item's sizes. For the seed we
    // (idempotently) ensure the exact (color, size) pairs we're about
    // to seed exist as variants.
    for (const s of stockSeeds) {
      const itemRow = (
        await db
          .select({ itemId: itemColors.itemId })
          .from(itemColors)
          .where(eq(itemColors.id, s.itemColorId))
      ).at(0)
      if (!itemRow) {
        throw new Error(`Seed: item_colors row not found for ${s.itemColorId}`)
      }
      await db
        .insert(variants)
        .values({
          itemId: itemRow.itemId,
          colorId: s.itemColorId,
          size: s.size,
        })
        .onConflictDoNothing()
    }

    let stockInserted = 0
    for (const s of stockSeeds) {
      const sellFloor = (Number(s.costUgx) * 1.8).toFixed(2)
      const variantRow = (
        await db
          .select({ id: variants.id, itemId: variants.itemId })
          .from(variants)
          .where(
            sql`${variants.colorId} = ${s.itemColorId}::uuid AND ${variants.size} = ${s.size}`,
          )
      ).at(0)
      if (!variantRow) {
        throw new Error(
          `Seed: variant missing for (${s.itemColorId}, ${s.size}) — run pnpm backfill:variants`,
        )
      }
      // Variant-flexibility Plan 1 moved minimum_sell_price from
      // store_stock to items (item-wide floor). Push the seed's
      // sell-floor up to the item before inserting stock; the same item
      // may be touched multiple times — fine, the value is the same.
      await db
        .update(items)
        .set({ minimumSellPriceUgx: sellFloor })
        .where(eq(items.id, variantRow.itemId))
      const result = await db
        .insert(storeStock)
        .values({
          storeId: store.id,
          itemId: variantRow.itemId,
          variantId: variantRow.id,
          quantityOnHand: s.qty,
          costPerUnitUgx: s.costUgx,
        })
        .onConflictDoNothing({
          target: [
            storeStock.storeId,
            storeStock.itemId,
            storeStock.variantId,
            storeStock.supplyRouteLineId,
          ],
        })
        .returning()
      stockInserted += result.length
    }
    console.log(
      `  ${stockInserted} store stock rows inserted (others already present).`,
    )

    console.log('Seed complete.')
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
