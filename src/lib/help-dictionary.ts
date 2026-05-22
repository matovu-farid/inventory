/**
 * Centralized in-app glossary.
 *
 * One entry per ambiguous term — used by `<FieldLabel help="…">` for form
 * fields and `<InfoTip term="…">` for everything else (KPI cards, table
 * headers, status badges, etc). The goal is that every domain term in the UI
 * has exactly one canonical explanation, so users learn the system as they
 * use it.
 *
 * Keys are stable, dot-namespaced strings. Group new entries by area so
 * additions stay easy to find:
 *   - `supplyRoute.*`, `item.*`, `expense.*` — form fields
 *   - `supplier.*`, `customer.*`, `shop.*`    — form fields
 *   - `kpi.*`                                 — summary cards / stats
 *   - `col.*`                                 — table column headers
 *   - `status.*`                              — workflow states
 */
export interface HelpEntry {
  /** One-sentence description of what the term means. */
  description: string
  /** Optional concrete example value or scenario. */
  example?: string
}

export const helpDict = {
  // ─── Supply Route form ───────────────────────────────────────────────
  "supplyRoute.name": {
    description:
      "A friendly name for this sourcing trip so you can find it later.",
    example: "China Trip — May 2026",
  },
  "supplyRoute.departureDate": {
    description: "The date you leave for the trip.",
  },
  "supplyRoute.returnDate": {
    description: "The date you expect to return with the goods.",
  },
  "supplyRoute.budgetUsd": {
    description:
      "Planned spend for the whole trip in USD. Used to compare against actual costs once items and expenses are recorded.",
    example: "10,000",
  },
  "supplyRoute.notes": {
    description:
      "Anything else worth remembering about this trip — markets visited, contacts made, lessons learned.",
  },

  // ─── Item form (inside a Supply Route) ───────────────────────────────
  "item.productName": {
    description: "What you call this product when talking with customers.",
    example: "Men's Leather Loafers",
  },
  "item.articleNumber": {
    description:
      "The supplier's catalog/SKU code for this product. Optional, but useful for re-ordering the exact same item later.",
    example: "SH-2045-BLK",
  },
  "item.supplierId": {
    description: "Which supplier you bought this item from on the trip.",
  },
  "item.quantity": {
    description: "How many units you purchased.",
    example: "120",
  },
  "item.detailMode": {
    description:
      "How detailed your procurement entry is. Pick 'Total only' if you don't yet know the breakdown — an admin can split into colors and sizes later before the goods are received.",
  },
  "item.aggregateQty": {
    description:
      "Total units purchased across all colors and sizes. Must be resolved into specific colors/sizes before the route can be received.",
    example: "120",
  },
  "item.unitPrice": {
    description: "Price per single unit, in the currency the supplier billed.",
    example: "85 RMB per pair",
  },
  "item.currency": {
    description:
      "The currency the supplier invoiced you in — usually the local currency of the source country.",
    example: "RMB for purchases in China",
  },
  "item.sourceRate": {
    description:
      "How many units of the source currency equal 1 USD on the day you paid. Used to convert costs into USD for reporting.",
    example: "7.25 RMB = 1 USD",
  },
  "item.ugxPerUsd": {
    description:
      "How many UGX equal 1 USD on the day you paid. Used to convert costs into UGX so you can price for the local market.",
    example: "3,750 UGX = 1 USD",
  },

  // ─── Expense form (inside a Supply Route) ────────────────────────────
  "expense.category": {
    description:
      "What kind of trip cost this is — used to group spending in reports.",
    example: "Freight, Customs, Lodging, Local transport",
  },
  "expense.description": {
    description:
      "A short note so you remember what this expense covered when reviewing it later.",
    example: "Container shipping from Guangzhou to Mombasa",
  },
  "expense.amount": {
    description: "Amount paid, in the currency selected.",
    example: "1,200",
  },

  // ─── Supplier form ───────────────────────────────────────────────────
  "supplier.name": {
    description:
      "The supplier's business name as you'd write it on a purchase order.",
    example: "Guangzhou Mei Da Trading Co.",
  },
  "supplier.type": {
    description:
      "Local suppliers are based in Uganda. International suppliers are abroad and typically involve import logistics.",
  },
  "supplier.country": {
    description: "The country this supplier ships from.",
    example: "China",
  },
  "supplier.contactName": {
    description: "The person you usually deal with at the supplier.",
    example: "Mr. Li Wei",
  },
  "supplier.contactPhone": {
    description: "Best phone or WhatsApp number for that contact.",
  },
  "supplier.contactEmail": {
    description: "Email for invoices, quotes, and shipping documents.",
  },
  "supplier.notes": {
    description:
      "Payment terms, MOQs, quality issues, or anything else worth remembering about this supplier.",
  },

  // ─── Customer form ───────────────────────────────────────────────────
  "customer.name": {
    description: "The customer's name as you'd address them.",
    example: "Sarah N.",
  },
  "customer.phone": {
    description:
      "Phone or WhatsApp for follow-ups. Optional — only fill in if the customer is happy to share it.",
  },
  "customer.notes": {
    description:
      "Anything that helps you serve them better — sizes, preferences, credit history.",
  },

  // ─── Settings — Shop ─────────────────────────────────────────────────
  "shop.name": {
    description: "Display name of the shop. Appears on receipts and reports.",
    example: "Owino Branch",
  },
  "shop.location": {
    description: "Where the shop is physically located.",
    example: "Kampala",
  },

  // ─── Generic field helpers ───────────────────────────────────────────
  "field.receivedDate": {
    description:
      "The date the goods actually arrived at the warehouse. Defaults to today. Only admins can change it.",
    example: "2026-04-10 — even if you're entering it on 2026-05-22.",
  },

  // ─── KPI cards / summary stats ───────────────────────────────────────
  "kpi.itemCosts": {
    description:
      "Total cost of all items on this trip, converted to UGX at the exchange rate you entered for each item.",
    example: "120 pairs × 85 RMB ÷ 7.25 × 3,750 = 5,275,862 UGX",
  },
  "kpi.expenses": {
    description:
      "Sum of every trip expense (freight, customs, lodging, local transport, etc.) recorded against this route, in UGX.",
  },
  "kpi.grandTotal": {
    description:
      "Item Costs + Expenses. The all-in landed cost of this trip in UGX — what you should price your retail margin against.",
  },
  "kpi.cashOnHand": {
    description:
      "Money sitting in the till or the safe right now, according to the ledger.",
  },
  "kpi.bankBalance": {
    description:
      "Money in your business bank account(s), according to the ledger.",
  },
  "kpi.totalLiquidity": {
    description:
      "Cash on Hand + Bank Balance — money you could spend today without selling stock.",
  },
  "kpi.totalItemsStore": {
    description:
      "Number of individual units currently in the central warehouse, summed across every product.",
  },
  "kpi.inventoryValue": {
    description:
      "What it cost you to buy everything currently in the warehouse, in UGX. Not the retail price.",
  },
  "kpi.itemsInStockShop": {
    description:
      "Number of individual units currently at this shop, summed across every product.",
  },
  "kpi.shopStockValue": {
    description: "What it cost you to buy the stock currently at this shop, in UGX.",
  },

  // ─── Table column headers ────────────────────────────────────────────
  "col.articleNumber": {
    description:
      "The supplier's catalog/SKU code for the product. Useful when re-ordering the exact same item.",
    example: "SH-2045-BLK",
  },
  "col.totalForeign": {
    description:
      "Quantity × Unit Price, in the currency the supplier invoiced.",
    example: "120 × 85 = 10,200 RMB",
  },
  "col.totalUsd": {
    description:
      "The same line total converted to USD using the source-currency rate you entered.",
  },
  "col.totalUgx": {
    description:
      "The same line total converted to UGX. This is the cost basis used for pricing and reporting.",
  },
  "col.qtyOnHand": {
    description:
      "Number of units currently available to sell at this location. Updates as items are received, transferred, or sold.",
  },
  "col.expected": {
    description: "Quantity that was meant to arrive, based on the supply route.",
  },
  "col.received": {
    description: "Quantity actually counted on arrival.",
  },
  "col.transitLoss": {
    description:
      "Units that left the supplier but never arrived — lost or stolen in transit. Written off as a loss.",
  },
  "col.dispatched": {
    description:
      "Quantity that was sent out from the warehouse on this transfer. Compare against Received to detect distribution loss.",
  },
  "col.businessDate": {
    description:
      "When the event actually happened in the business — the date goods arrived, the sale was made, etc.",
  },
  "col.recordedDate": {
    description:
      "When the row was entered into the system. Equal to the business date unless someone backdated.",
  },
  "col.actor": {
    description: "The user who performed the action.",
  },
  "col.activity": {
    description:
      "A human-readable summary of what happened. Click 'Details' for the raw before/after data.",
  },
  "transferItem.minSellPrice": {
    description:
      "The lowest price the shop is allowed to charge customers for this item. Defaults to the warehouse's cost-per-unit; the dispatcher can raise it to enforce a margin floor.",
  },

  // ─── Workflow status values ──────────────────────────────────────────
  "status.planning": {
    description:
      "You're still preparing the trip — adding items, fixing budget, lining up suppliers. Nothing has been spent yet.",
  },
  "status.active": {
    description:
      "The trip is in motion — you've left, you're buying, or the goods are in transit. Costs are being recorded.",
  },
  "status.completed": {
    description:
      "Goods have arrived and been received into the warehouse. The route is closed for further edits.",
  },

  // ─── Product / Variant catalog ───────────────────────────────────────
  "product.articleNumber": {
    description:
      "Unique code for the product (e.g. TR-001). The same article in different colors is one product with multiple color variants.",
    example: "TR-001",
  },
  "product.colorName": {
    description:
      "Friendly name of the color (e.g. Burgundy, Navy). Auto-suggested from the uploaded image; you can override from the palette, the eyedropper, or type your own.",
    example: "Burgundy",
  },
  "product.colorHex": {
    description:
      "Hex code that drives the on-screen swatch (e.g. #7b1f2b). Matched to the nearest palette tile.",
    example: "#7b1f2b",
  },
  "product.sizes": {
    description:
      "Sizes this product comes in (e.g. S, M, L). Each variant grid row is one color × one size.",
    example: "S, M, L",
  },
  "product.image": {
    description:
      "One image per color. Click the image after upload to eyedrop a different pixel as the color sample.",
  },
  "col.variant": {
    description: "Color × size combination held by this stock row.",
    example: "Burgundy / M",
  },

  // ─── Opening Balance form ────────────────────────────────────────────
  "openingBalance.productName": {
    description:
      "Pick the product whose stock you're seeding. Use the dropdown or create a new product on the fly.",
  },
  "openingBalance.articleNumber": {
    description:
      "Legacy: use `product.articleNumber` going forward. Kept as a stale alias so older references still resolve.",
    example: "TR-001",
  },
  "openingBalance.quantity": {
    description:
      "How many units of this product you currently have on hand at this location, before the system goes live.",
    example: "120",
  },
  "openingBalance.costPerUnit": {
    description:
      "Landed cost per unit in UGX — what one piece actually cost you including freight, duties, and other expenses. This sets the inventory value on your books and the floor for your sell price.",
    example: "2,068,966",
  },
  "openingBalance.lineTotal": {
    description:
      "Quantity × Cost/Unit. The total UGX value this row will add to your inventory and to Owner's Equity when submitted.",
  },
  "openingBalance.shop": {
    description:
      "Which shop these existing items are sitting in. Each shop's opening balance is entered separately.",
  },

  // ─── POS (point-of-sale) UI ──────────────────────────────────────────
  "pos.search": {
    description: "Type article number or product name to filter the grid.",
  },
  "pos.cart": {
    description: "Items added but not yet checked out. Tap to expand.",
  },
  "pos.variant": {
    description:
      "A specific color and size combination. Stock is tracked per variant.",
  },
  "pos.belowMin": {
    description:
      "Selling below the recommended minimum price. A reason is required so the admin can review.",
  },

  // ─── Notification thresholds settings ───────────────────────────────────
  "notifications.thresholds.storeMode": {
    description:
      "Whether the warehouse low-stock trigger is expressed as a percentage of the rolling batch average or as a fixed number of units remaining.",
    example: "Percentage",
  },
  "notifications.thresholds.storeValue": {
    description:
      "The warehouse threshold value. If mode is Percentage, this is the % of the rolling 3-batch average below which an alert fires. If mode is Units, it is an absolute unit count.",
    example: "30 (percent) or 5 (units)",
  },
  "notifications.thresholds.shopMode": {
    description:
      "Whether each shop's low-stock trigger is expressed as a percentage of the rolling batch average or as a fixed number of units remaining.",
    example: "Percentage",
  },
  "notifications.thresholds.shopValue": {
    description:
      "The shop threshold value. If mode is Percentage, this is the % of the rolling 3-batch average below which an alert fires. If mode is Units, it is an absolute unit count.",
    example: "15 (percent) or 2 (units)",
  },

  // ─── Notification threshold overrides ───────────────────────────────────
  "notifications.overrides.title": {
    description:
      "Per-variant rules that replace the global defaults. Use these when a specific product color+size needs a different trigger than the system-wide setting.",
  },
  "notifications.overrides.scope": {
    description:
      "Whether this override applies to warehouse stock (Store) or shop floor stock (Shop).",
    example: "Store",
  },
  "notifications.overrides.product": {
    description:
      "The specific product color variant this override covers. Identified by article number and color name.",
    example: "SH-2045 · Black",
  },
  "notifications.overrides.size": {
    description:
      "The specific size this override covers. Only that size is affected; other sizes still use the global default.",
    example: "XL",
  },
  "notifications.overrides.rule": {
    description:
      "The threshold that triggers a low-stock alert for this variant. Shown as '≤ X%' or '≤ X units'.",
    example: "≤ 10%",
  },
} as const satisfies Record<string, HelpEntry>

export type HelpKey = keyof typeof helpDict
