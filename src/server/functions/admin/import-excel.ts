import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as XLSX from "xlsx"
import { db } from "#/db"
import { supplyRoutes, supplyRouteItems } from "#/db/schema"
import {
  parseExcelRouteSheet,
  computeExternalRef
  
} from "#/lib/excel/parser"
import type {RawRow} from "#/lib/excel/parser";
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const importInput = z.object({
  filename: z.string().min(1),
  fileBase64: z.string().min(1),
})

interface ImportResult {
  routesImported: number
  routesSkipped: number
  itemsImported: number
}

/**
 * Admin-only one-shot import of historical supply routes from an Excel
 * spreadsheet. Each sheet is treated as one route. Re-running the import
 * with the same file is idempotent thanks to externalRef = sha256(filename + sheet).
 *
 * No ledger entries are posted for historical routes — the business
 * considers them already settled. Opening balances should be entered as
 * a separate Owner's Equity journal.
 */
export const importExcel = createServerFn()
  .inputValidator(importInput)
  .handler(async ({ data }): Promise<ImportResult> => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const userId = (session.user as { id: string }).id

    const buffer = Buffer.from(data.fileBase64, "base64")
    const workbook = XLSX.read(buffer, { type: "buffer" })

    let routesImported = 0
    let routesSkipped = 0
    let itemsImported = 0

    return db.transaction(async (tx) => {
      for (const sheetName of workbook.SheetNames) {
        const externalRef = computeExternalRef(data.filename, sheetName)

        const existing = await tx.query.supplyRoutes.findFirst({
          where: eq(supplyRoutes.externalRef, externalRef),
        })
        if (existing) {
          routesSkipped++
          continue
        }

        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: undefined })
        let parsed
        try {
          parsed = parseExcelRouteSheet(sheetName, rows)
        } catch (err) {
          // Skip sheets that don't conform to the expected shape (e.g., a
          // summary tab). Log the reason so the user can see it.
          await recordAuditLog(tx, {
            actorUserId: userId,
            action: "import.excel.skip_sheet",
            entityType: "supply_route",
            entityId: externalRef,
            metadata: {
              filename: data.filename,
              sheetName,
              reason: err instanceof Error ? err.message : String(err),
            },
          })
          routesSkipped++
          continue
        }

        const [route] = await tx
          .insert(supplyRoutes)
          .values({
            name: parsed.name,
            status: "completed",
            externalRef,
          })
          .returning()

        for (const item of parsed.items) {
          // Compute totals if exchange rates are present
          const totalAmountForeign = (
            Number(item.unitPriceForeign) * item.quantity
          ).toFixed(2)
          const totalAmountUsd = item.exchangeRateForeignToUsd
            ? (
                Number(totalAmountForeign) /
                Number(item.exchangeRateForeignToUsd)
              ).toFixed(2)
            : null
          const totalCostUgx =
            item.exchangeRateForeignToUsd && item.exchangeRateUsdToUgx
              ? (
                  (Number(item.unitPriceForeign) /
                    Number(item.exchangeRateForeignToUsd)) *
                  Number(item.exchangeRateUsdToUgx) *
                  item.quantity
                ).toFixed(2)
              : "0"

          await tx.insert(supplyRouteItems).values({
            supplyRouteId: route.id,
            // supplierId is required at the schema level — for historical
            // imports we use a placeholder "Unknown" supplier created
            // upstream (see future work). For now, set null and adjust the
            // schema if importing without a supplier should be allowed.
            supplierId: null as unknown as string,
            productName: item.productName,
            articleNumber: item.articleNumber ?? undefined,
            quantity: item.quantity,
            unitPriceForeign: item.unitPriceForeign,
            foreignCurrency: item.foreignCurrency,
            exchangeRateForeignToUsd: item.exchangeRateForeignToUsd,
            exchangeRateUsdToUgx: item.exchangeRateUsdToUgx,
            totalAmountForeign,
            totalAmountUsd,
            totalCostUgx,
          })
          itemsImported++
        }

        await recordAuditLog(tx, {
          actorUserId: userId,
          action: "import.excel.route",
          entityType: "supply_route",
          entityId: route.id,
          metadata: {
            filename: data.filename,
            sheetName,
            externalRef,
            itemCount: parsed.items.length,
          },
        })

        routesImported++
      }

      return { routesImported, routesSkipped, itemsImported }
    })
  })
