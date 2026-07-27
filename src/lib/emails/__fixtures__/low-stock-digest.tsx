import type { LowStockDigestData } from '#/lib/emails/low-stock-digest'

export const sampleLowStockDigestData: LowStockDigestData = {
  recipientName: 'Aisha',
  appUrl: 'https://inventory.fidexa.org',
  generatedAt: new Date('2026-05-21T07:00:00+03:00'),
  storeLowCount: 4,
  shopLowCount: 12,
  shopsAffectedCount: 3,
  topItems: [
    {
      scope: 'shop',
      locationName: 'Kampala Central',
      itemLabel: 'AX-101 Black/M',
      quantityAtOpen: 2,
      baseline: 80,
      rule: { mode: 'percent', value: 15 },
      severity: 'critical',
    },
    {
      scope: 'shop',
      locationName: 'Entebbe Mall',
      itemLabel: 'AX-101 Black/L',
      quantityAtOpen: 4,
      baseline: 60,
      rule: { mode: 'percent', value: 15 },
      severity: 'critical',
    },
    {
      scope: 'store',
      locationName: 'Main Warehouse',
      itemLabel: 'BX-203 Red/S',
      quantityAtOpen: 12,
      baseline: 110,
      rule: { mode: 'percent', value: 30 },
      severity: 'warning',
    },
    {
      scope: 'shop',
      locationName: 'Jinja Road',
      itemLabel: 'CX-440 Blue/XL',
      quantityAtOpen: 1,
      baseline: 5,
      rule: { mode: 'units', value: 5 },
      severity: 'warning',
    },
  ],
  storeRequisitionsUrl:
    'https://inventory.fidexa.org/store/restock-requisitions',
  shopSuggestionsUrl: 'https://inventory.fidexa.org/shop',
  manageNotificationsUrl: 'https://inventory.fidexa.org/settings/notifications',
}
