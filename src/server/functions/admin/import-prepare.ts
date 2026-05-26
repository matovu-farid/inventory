import BigNumber from "bignumber.js"
import type { ParsedRouteItem } from "#/lib/excel/parser"
import type { supplyRouteLines } from "#/db/schema"

type NewSupplyRouteItem = typeof supplyRouteLines.$inferInsert

/**
 * Build a `supplyRouteLines` insert row from a parsed Excel item.
 *
 * DISABLED: Excel import has not been ported to the variant schema yet
 * (plan §9 explicitly defers variant support for the importer). The
 * importer cannot know which `productColorId` to associate with a parsed
 * row, so this helper now throws to surface the gap loudly. Re-enable
 * once variant resolution (article-number + color-name lookup, or an
 * "uncategorized" sentinel) is designed.
 */
export function prepareImportItem(
  _item: ParsedRouteItem,
  _supplierId: string,
  _supplyRouteId: string,
): NewSupplyRouteItem {
  throw new Error(
    "Excel import is disabled while variant support is being added. Use the manual flow for now.",
  )
  // Unreachable: previous implementation built a supplyRouteLines insert
  // row from the parsed item. Kept for reference when re-enabling.
  void BigNumber
}
