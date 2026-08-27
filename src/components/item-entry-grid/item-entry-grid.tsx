/**
 * Shared item-entry renderer.
 *
 * The receipt grid owns the implementation for now so existing receipt routes
 * keep their public API. Opening-balance uses this same renderer through this
 * stable shared entry point and only adapts its row data and labels.
 */
export {
  RECEIPT_GRID_CONFIG,
  ReceiptGrid as ItemEntryGrid,
  isReceiptGridOutsideClick as isItemEntryGridOutsideClick,
} from '#/components/supply/receipt-grid/receipt-grid'
export type { ReceiptGridHistoryControls as ItemEntryGridHistoryControls } from '#/components/supply/receipt-grid/receipt-grid'
