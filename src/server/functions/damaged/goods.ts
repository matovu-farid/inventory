import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { shopStock, storeStock } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const locationEnum = z.enum(["store", "shop"])

const markGoodsDamagedInput = z.object({
  locationType: locationEnum,
  stockId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
})

/**
 * Move goods from regular stock to the damaged-goods bucket. Decrements
 * quantityOnHand, increments damagedQuantity, and posts:
 *   DR Damaged Inventory - Store|Shop / CR Inventory - Store|Shop
 */
export const markGoodsDamaged = createServerFn()
  .inputValidator(markGoodsDamagedInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      if (data.locationType === "shop") {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, data.stockId),
        })
        if (!stock) throw new Error(`Shop stock not found: ${data.stockId}`)
        if (stock.quantityOnHand < data.quantity) {
          throw new Error(
            `Not enough stock to mark damaged: have ${stock.quantityOnHand}, need ${data.quantity}`,
          )
        }
        const cost = new BigNumber(stock.costPerUnitUgx).times(data.quantity)
        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} - ${data.quantity}`,
            damagedQuantity: sql`${shopStock.damagedQuantity} + ${data.quantity}`,
          })
          .where(eq(shopStock.id, data.stockId))
        await postJournalEntry(tx, {
          entries: [
            { type: "debit", category: "Damaged Inventory - Shop", amount: cost.toFixed(2) },
            { type: "credit", category: "Inventory - Shop", amount: cost.toFixed(2) },
          ],
          referenceType: "mark_damaged",
          referenceId: data.stockId,
          locationType: "shop",
          locationId: stock.shopId,
          recordedBy: userId,
          description: `Mark damaged: ${data.reason}`,
        })
        return { ok: true }
      }

      const stock = await tx.query.storeStock.findFirst({
        where: eq(storeStock.id, data.stockId),
      })
      if (!stock) throw new Error(`Store stock not found: ${data.stockId}`)
      if (stock.quantityOnHand < data.quantity) {
        throw new Error(
          `Not enough stock to mark damaged: have ${stock.quantityOnHand}, need ${data.quantity}`,
        )
      }
      const cost = new BigNumber(stock.costPerUnitUgx).times(data.quantity)
      await tx
        .update(storeStock)
        .set({
          quantityOnHand: sql`${storeStock.quantityOnHand} - ${data.quantity}`,
          damagedQuantity: sql`${storeStock.damagedQuantity} + ${data.quantity}`,
        })
        .where(eq(storeStock.id, data.stockId))
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Damaged Inventory - Store", amount: cost.toFixed(2) },
          { type: "credit", category: "Inventory - Store", amount: cost.toFixed(2) },
        ],
        referenceType: "mark_damaged",
        referenceId: data.stockId,
        locationType: "store",
        locationId: stock.storeId,
        recordedBy: userId,
        description: `Mark damaged: ${data.reason}`,
      })
      return { ok: true }
    })
  })

const writeOffDamagedInput = z.object({
  locationType: locationEnum,
  stockId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
})

/**
 * Write off damaged goods that cannot be sold. Posts:
 *   DR Damaged Goods Write-off / CR Damaged Inventory - Store|Shop
 */
export const writeOffDamagedGoods = createServerFn()
  .inputValidator(writeOffDamagedInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      if (data.locationType === "shop") {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, data.stockId),
        })
        if (!stock) throw new Error(`Shop stock not found: ${data.stockId}`)
        if (stock.damagedQuantity < data.quantity) {
          throw new Error(
            `Not enough damaged stock: have ${stock.damagedQuantity}, want to write off ${data.quantity}`,
          )
        }
        const cost = new BigNumber(stock.costPerUnitUgx).times(data.quantity)
        await tx
          .update(shopStock)
          .set({
            damagedQuantity: sql`${shopStock.damagedQuantity} - ${data.quantity}`,
          })
          .where(eq(shopStock.id, data.stockId))
        await postJournalEntry(tx, {
          entries: [
            { type: "debit", category: "Damaged Goods Write-off", amount: cost.toFixed(2) },
            { type: "credit", category: "Damaged Inventory - Shop", amount: cost.toFixed(2) },
          ],
          referenceType: "damaged_writeoff",
          referenceId: data.stockId,
          locationType: "shop",
          locationId: stock.shopId,
          recordedBy: userId,
          description: `Write-off ${data.quantity} damaged: ${data.reason}`,
        })
        return { ok: true, writtenOff: cost.toFixed(2) }
      }

      const stock = await tx.query.storeStock.findFirst({
        where: eq(storeStock.id, data.stockId),
      })
      if (!stock) throw new Error(`Store stock not found: ${data.stockId}`)
      if (stock.damagedQuantity < data.quantity) {
        throw new Error(
          `Not enough damaged stock: have ${stock.damagedQuantity}, want to write off ${data.quantity}`,
        )
      }
      const cost = new BigNumber(stock.costPerUnitUgx).times(data.quantity)
      await tx
        .update(storeStock)
        .set({
          damagedQuantity: sql`${storeStock.damagedQuantity} - ${data.quantity}`,
        })
        .where(eq(storeStock.id, data.stockId))
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Damaged Goods Write-off", amount: cost.toFixed(2) },
          { type: "credit", category: "Damaged Inventory - Store", amount: cost.toFixed(2) },
        ],
        referenceType: "damaged_writeoff",
        referenceId: data.stockId,
        locationType: "store",
        locationId: stock.storeId,
        recordedBy: userId,
        description: `Write-off ${data.quantity} damaged: ${data.reason}`,
      })
      return { ok: true, writtenOff: cost.toFixed(2) }
    })
  })
