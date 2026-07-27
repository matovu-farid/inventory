import * as React from 'react'

export function PosLayout({
  header,
  children,
  footer,
}: {
  header: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {header}
      <main className="flex-1 overflow-y-auto px-3 py-3">{children}</main>
      {footer}
    </div>
  )
}
