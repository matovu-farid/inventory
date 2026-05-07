import { createHash } from "node:crypto"

export interface RawRow {
  DATE?: string | number | Date
  DETAILS?: string
  "ART NO"?: string
  "EX.RATE"?: string | number
  QTY?: string | number
  "RATE(rmb)"?: string | number
  "AMOUNT(rmb)"?: string | number
  "USD($)"?: string | number
  "USD RATE(Shs)"?: string | number
  "T.COST(shs)"?: string | number
}

export interface ParsedRouteItem {
  productName: string
  articleNumber: string | null
  quantity: number
  unitPriceForeign: string
  foreignCurrency: "RMB" | "UGX"
  exchangeRateForeignToUsd: string | null
  exchangeRateUsdToUgx: string | null
}

export interface ParsedRoute {
  name: string
  items: ParsedRouteItem[]
}

function isBlank(row: RawRow): boolean {
  return !row.DETAILS && !row.QTY && !row["RATE(rmb)"]
}

function asNumString(v: string | number | undefined): string | null {
  if (v === undefined || v === "") return null
  return String(v)
}

export function parseExcelRouteSheet(name: string, rows: RawRow[]): ParsedRoute {
  const items: ParsedRouteItem[] = []
  for (const row of rows) {
    if (isBlank(row)) continue

    const productName = row.DETAILS?.trim()
    const qty = row.QTY === undefined ? null : Number(row.QTY)
    const rate = row["RATE(rmb)"] === undefined ? null : Number(row["RATE(rmb)"])

    if (!productName || qty === null || rate === null || isNaN(qty) || isNaN(rate)) {
      throw new Error(
        `parseExcelRouteSheet: row in "${name}" is missing required fields (DETAILS, QTY, RATE(rmb))`,
      )
    }

    items.push({
      productName,
      articleNumber: row["ART NO"] ? String(row["ART NO"]) : null,
      quantity: qty,
      unitPriceForeign: String(rate),
      foreignCurrency: "RMB",
      exchangeRateForeignToUsd: asNumString(row["EX.RATE"]),
      exchangeRateUsdToUgx: asNumString(row["USD RATE(Shs)"]),
    })
  }

  return { name, items }
}

export function computeExternalRef(filename: string, sheetName: string): string {
  return createHash("sha256")
    .update(`${filename}|${sheetName}`)
    .digest("hex")
}
