export type CsvValue = string | number | boolean | null | undefined

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const rawText = String(value)
  const text =
    typeof value === 'string' &&
    /^[=+\-@]/.test(rawText) &&
    !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(rawText)
      ? `'${rawText}`
      : rawText
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  return (
    [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n') + '\n'
  )
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
