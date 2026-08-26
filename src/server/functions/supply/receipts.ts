import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createSupplyRouteReceiptServer,
  deleteSupplyRouteReceiptServer,
  replaceSupplyRouteReceiptServer,
} from './receipts.server'

const receiptLineInput = z.object({
  design: z.string().trim().min(1).max(64),
  itemId: z.uuid().nullable().optional(),
  articleNumber: z.string().trim().min(1).max(64),
  colorId: z.uuid().nullable().optional(),
  colorText: z.string().trim().max(200).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  size: z.string().trim().max(200).optional(),
  quantity: z.number().int().positive(),
  unitPriceForeign: z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
})

const receiptDraft = z.object({
  supplyRouteId: z.uuid(),
  receiptId: z.uuid().optional(),
  supplierId: z.uuid(),
  receiptDate: z.string().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().max(2000).optional(),
  foreignCurrency: z.enum(['RMB', 'USD', 'UGX']).default('RMB'),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
  lines: z.array(receiptLineInput).min(1),
})

export const createSupplyRouteReceipt = createServerFn()
  .inputValidator(receiptDraft)
  .handler(({ data }) => createSupplyRouteReceiptServer(data))

export const replaceSupplyRouteReceipt = createServerFn()
  .inputValidator(receiptDraft.extend({ receiptId: z.uuid() }))
  .handler(({ data }) => replaceSupplyRouteReceiptServer(data))

export const deleteSupplyRouteReceipt = createServerFn()
  .inputValidator(z.object({ supplyRouteId: z.uuid(), receiptId: z.uuid() }))
  .handler(({ data }) => deleteSupplyRouteReceiptServer(data))
