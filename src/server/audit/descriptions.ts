import { formatUgxTotal } from "#/lib/format"

export const AUDIT_ACTION_LABELS = {
  "store.receiveGoods": "Received goods",
  "transfer.create": "Dispatched transfer",
  "transfer.receive": "Received transfer at shop",
  "sale.create": "Recorded sale",
  "shopReturn.create": "Recorded shop return",
  "storeReturn.dispatch": "Dispatched store return",
  "storeReturn.receive": "Received store return",
  "stockTake.start": "Started stock take",
  "stockTake.reconcile": "Reconciled stock take",
  "customerPayment.record": "Recorded customer payment",
  "customerPayment.writeOff": "Wrote off customer balance",
  "openingBalance.store": "Set warehouse opening balance",
  "openingBalance.shop": "Set shop opening balance",
  "import.excel.route": "Imported supply route from Excel",
  "import.excel.skip_sheet": "Skipped Excel sheet during import",
  "stock.specify": "Specified stock variants",
} as const

export type AuditActionCode = keyof typeof AUDIT_ACTION_LABELS

export interface AuditDescriptionContext {
  actorName: string
  recordedAt?: Date
  businessDate?: Date | null
  routeName?: string
  shopName?: string
  storeName?: string
  itemCount?: number
  totalReceived?: number
  totalTransitLoss?: number
  totalAmount?: string
  paymentMethod?: string
  documentNumber?: string
  filename?: string
  sheetName?: string
  reason?: string
  articleNumber?: string
  itemName?: string
  specifiedTotal?: number
  remainingUnresolved?: number
  variantCount?: number
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD in UTC; OK for display
}

function dateTail(ctx: AuditDescriptionContext): string {
  if (!ctx.businessDate || !ctx.recordedAt) return ""
  const business = formatDay(ctx.businessDate)
  const recorded = formatDay(ctx.recordedAt)
  if (business === recorded) return ""
  return ` Business date ${business}, recorded ${recorded}.`
}

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action
}

export function renderAuditDescription(
  action: string,
  ctx: AuditDescriptionContext,
): string {
  const actor = ctx.actorName || "Someone"
  switch (action) {
    case "store.receiveGoods": {
      const tail = dateTail(ctx)
      const loss =
        ctx.totalTransitLoss && ctx.totalTransitLoss > 0
          ? ` (${ctx.totalTransitLoss} lost in transit)`
          : ""
      return `${actor} received ${ctx.totalReceived ?? 0} units across ${ctx.itemCount ?? 0} item(s) on supply route '${ctx.routeName ?? "(unknown)"}'${loss}.${tail}`
    }
    case "transfer.create":
      return `${actor} dispatched ${ctx.itemCount ?? 0} item(s) from the warehouse to ${ctx.shopName ?? "(unknown shop)"}.`
    case "transfer.receive":
      return `${actor} received ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"}.`
    case "sale.create": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      const method = ctx.paymentMethod ? ` (${ctx.paymentMethod})` : ""
      return `${actor} sold ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"} for ${total}${method}.`
    }
    case "shopReturn.create":
      return `${actor} recorded a return of ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"}.`
    case "storeReturn.dispatch":
      return `${actor} dispatched a return of ${ctx.itemCount ?? 0} item(s) from ${ctx.shopName ?? "(unknown shop)"} to the warehouse.`
    case "storeReturn.receive":
      return `${actor} received the return of ${ctx.itemCount ?? 0} item(s) at the warehouse.`
    case "stockTake.start":
      return `${actor} started a stock take at ${ctx.shopName ?? ctx.storeName ?? "(unknown location)"}.`
    case "stockTake.reconcile":
      return `${actor} reconciled a stock take at ${ctx.shopName ?? ctx.storeName ?? "(unknown location)"} — ${ctx.itemCount ?? 0} adjustment(s).`
    case "customerPayment.record": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      return `${actor} recorded a customer payment of ${total}${ctx.documentNumber ? ` (${ctx.documentNumber})` : ""}.`
    }
    case "customerPayment.writeOff": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      return `${actor} wrote off ${total} of customer balance.`
    }
    case "openingBalance.store":
      return `${actor} set the warehouse opening balance (${ctx.itemCount ?? 0} stock line(s)).`
    case "openingBalance.shop":
      return `${actor} set the opening balance for ${ctx.shopName ?? "(unknown shop)"} (${ctx.itemCount ?? 0} stock line(s)).`
    case "import.excel.route":
      return `${actor} imported supply route from '${ctx.filename ?? "(file)"}'${ctx.sheetName ? ` (sheet: ${ctx.sheetName})` : ""}.`
    case "import.excel.skip_sheet":
      return `${actor} skipped Excel sheet '${ctx.sheetName ?? "(sheet)"}' during import${ctx.reason ? `: ${ctx.reason}` : ""}.`
    case "stock.specify": {
      const variantCount = ctx.variantCount ?? 0
      const specifiedTotal = ctx.specifiedTotal ?? 0
      const remainingUnresolved = ctx.remainingUnresolved ?? 0
      const variantWord = variantCount === 1 ? "variant" : "variants"
      const tail =
        remainingUnresolved > 0 ? `, ${remainingUnresolved} still to label` : ""
      return `${actor} specified ${specifiedTotal}× ${ctx.articleNumber ?? "(unknown)"} ${ctx.itemName ?? ""} into ${variantCount} ${variantWord}${tail}.`
    }
    default:
      return `${actor} performed action: ${action}.`
  }
}
