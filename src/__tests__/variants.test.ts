import { describe, it, expect, afterAll } from "vitest"
import { eq, inArray, and, sql } from "drizzle-orm"

import { db } from "#/db"
import { products, productColors, variants } from "#/db/schema"
import { backfillVariants } from "../../scripts/backfill-variants"

// Real-DB integration tests. Mirror item-categories.test.ts: each test seeds
// the rows it needs through the schema and cleans them up in afterAll. The
// test database is set up via `pnpm db:push:test`.

const SUFFIX = `${Date.now()}`
const ART_A = `var-test-a-${SUFFIX}`
const ART_B = `var-test-b-${SUFFIX}`

const createdProductIds: string[] = []

afterAll(async () => {
  if (createdProductIds.length > 0) {
    // CASCADE on products → product_colors → variants cleans everything.
    await db.delete(products).where(inArray(products.id, createdProductIds))
  }
})

describe("variants — backfill from existing color×size", () => {
  it("A: backfill row count equals distinct (color, size) pairs", async () => {
    const [prod] = await db
      .insert(products)
      .values({
        articleNumber: ART_A,
        name: `var-test-a-${SUFFIX}`,
        sizes: ["S", "M", "L"],
      })
      .returning()
    createdProductIds.push(prod.id)

    await db
      .insert(productColors)
      .values([
        { productId: prod.id, colorName: "Red", colorHex: "#ff0000" },
        { productId: prod.id, colorName: "Blue", colorHex: "#0000ff" },
      ])

    const summary = await backfillVariants()

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, prod.id))
    // 2 colors × 3 sizes = 6 variants.
    expect(rows).toHaveLength(6)
    expect(summary.inserted).toBeGreaterThanOrEqual(6)
  })

  it("B: a product with empty sizes produces zero variants", async () => {
    const [prod] = await db
      .insert(products)
      .values({
        articleNumber: ART_B,
        name: `var-test-b-${SUFFIX}`,
        sizes: [],
      })
      .returning()
    createdProductIds.push(prod.id)

    await db
      .insert(productColors)
      .values({ productId: prod.id, colorName: "Green", colorHex: "#00ff00" })

    await backfillVariants()

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, prod.id))
    expect(rows).toHaveLength(0)
  })

  it("C: unique (item_id, color_id, size) rejects duplicate insertion", async () => {
    const [prod] = createdProductIds.length
      ? await db.select().from(products).where(eq(products.id, createdProductIds[0]))
      : []
    expect(prod).toBeDefined()

    const [color] = await db
      .select()
      .from(productColors)
      .where(eq(productColors.productId, prod.id))
      .limit(1)

    await expect(
      db
        .insert(variants)
        .values({ itemId: prod.id, colorId: color.id, size: "S" }),
    ).rejects.toThrow(/duplicate|unique|conflict/i)
  })

  it("C2: re-running backfill is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const before = await db.select({ c: sql<number>`count(*)::int` }).from(variants)
    await backfillVariants()
    const after = await db.select({ c: sql<number>`count(*)::int` }).from(variants)
    expect(after[0].c).toBe(before[0].c)
  })

  it("D: unique partial barcode allows multiple NULLs, rejects duplicate non-NULL", async () => {
    const prodId = createdProductIds[0]
    const colors = await db
      .select()
      .from(productColors)
      .where(eq(productColors.productId, prodId))

    // Two existing variants without barcode should already coexist after
    // backfill — both have NULL barcode, so a third NULL is fine. Insert
    // a brand-new variant row for another size; idempotent backfill leaves
    // existing rows untouched, so we exercise barcode uniqueness directly.
    const barcode = `bc-${SUFFIX}`

    // Set barcode on the (color[0], "S") variant.
    await db
      .update(variants)
      .set({ barcode })
      .where(
        and(
          eq(variants.itemId, prodId),
          eq(variants.colorId, colors[0].id),
          eq(variants.size, "S"),
        ),
      )

    // Trying to set the same non-NULL barcode on a different variant must
    // fail because of the unique partial index.
    await expect(
      db
        .update(variants)
        .set({ barcode })
        .where(
          and(
            eq(variants.itemId, prodId),
            eq(variants.colorId, colors[0].id),
            eq(variants.size, "M"),
          ),
        ),
    ).rejects.toThrow(/duplicate|unique|conflict/i)

    // Two NULL barcodes are still allowed (the M and L rows are both NULL).
    const nullBarcodeRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(variants)
      .where(
        and(eq(variants.itemId, prodId), sql`barcode IS NULL`),
      )
    expect(nullBarcodeRows[0].c).toBeGreaterThanOrEqual(2)
  })
})
