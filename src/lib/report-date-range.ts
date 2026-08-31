import { z } from 'zod'

export type ReportDateBound = 'start' | 'end'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export const reportDateRangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'The report start date must be on or before the end date.',
  )

/** Parse a date-only report filter without relying on the machine timezone. */
export function parseReportDate(
  value: string | undefined,
  bound: ReportDateBound,
): Date | undefined {
  if (!value) return undefined
  const match = DATE_ONLY.exec(value)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const endOfDay = bound === 'end'
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  )

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return date
}

export function formatReportPeriod(from?: string, to?: string): string {
  if (from && to) return `${from} to ${to}`
  if (from) return `From ${from}`
  if (to) return `Through ${to}`
  return 'All dates'
}
