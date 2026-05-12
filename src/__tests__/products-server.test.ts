import { describe, it, expect } from "vitest"
import { db } from "#/db"
import { products, productColors } from "#/db/schema"
import { eq } from "drizzle-orm"

describe("products schema round-trip", () => {
  it("inserts a product, its color, and reads back via relation", async () => {
    const [p] = await db.insert(products).values({
      articleNumber: `TEST-${Date.now()}`,
      name: "Test Crew",
      sizes: ["S","M","L"],
    }).returning()

    await db.insert(productColors).values({
      productId: p.id, colorName: "Burgundy", colorHex: "#7b1f2b",
    })

    const fetched = await db.query.products.findFirst({
      where: eq(products.id, p.id),
      with: { colors: true },
    })
    expect(fetched?.colors).toHaveLength(1)
    expect(fetched?.colors[0].colorName).toBe("Burgundy")

    await db.delete(products).where(eq(products.id, p.id))
  })
})
