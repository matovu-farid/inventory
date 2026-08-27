import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createSupplyRouteReceiptServer,
  deleteSupplyRouteReceiptServer,
  replaceSupplyRouteReceiptServer,
} from './receipts.server'
import { isReceiptColorHexList } from '#/lib/colors/receipt-colors'

const receiptLineInput = z.object({
  itemName: z.string().trim().min(1).max(120).optional(),
  design: z.string().trim().min(1).max(64),
  itemId: z.uuid().nullable().optional(),
  articleNumber: z.string().trim().min(1).max(64),
  colorId: z.uuid().nullable().optional(),
  colorText: z.string().trim().max(200).optional(),
  colorHex: z
    .string()
    .refine(isReceiptColorHexList, 'Colour hex values must be #RRGGBB')
    .optional(),
  size: z.string().trim().max(200).optional(),
  quantity: z.number().int().positive(),
  unitPriceForeign: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/),
  minimumSellPriceUgx: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
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
