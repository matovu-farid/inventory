const TZ = 'Africa/Kampala'

export function formatDayKampala(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function isSameDayKampala(a: Date, b: Date): boolean {
  return formatDayKampala(a) === formatDayKampala(b)
}
