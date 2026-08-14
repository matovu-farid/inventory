import { FileQuestion, RefreshCw, TriangleAlert } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { Logo } from '#/components/logo'
import { ErrorDetails } from '#/components/error-details'
import { Button } from '#/components/ui/button'
import { getSafeErrorMessage } from '#/lib/error-handling'

function ErrorPageLayout({
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-8 text-center shadow-lg sm:p-10">
        <Logo className="mx-auto size-14 shadow-md" />
        <div className="mx-auto mt-7 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-8 flex justify-center">{action}</div>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <ErrorPageLayout
      icon={<FileQuestion className="size-6" aria-hidden="true" />}
      eyebrow="404 · Not found"
      title="Page not found"
      description="The page you’re looking for may have moved, or the address may be incorrect."
      action={
        <Button asChild size="lg">
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
    />
  )
}

export function RouteErrorPage({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  return (
    <ErrorPageLayout
      icon={<TriangleAlert className="size-6" aria-hidden="true" />}
      eyebrow="Unexpected error"
      title="We hit a snag"
      description={getSafeErrorMessage(
        undefined,
        'This page could not load correctly. Try again, or return to the dashboard.',
      )}
      action={
        <div className="w-full">
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" onClick={reset}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/">Back to dashboard</Link>
            </Button>
          </div>
          <ErrorDetails error={error} />
        </div>
      }
    />
  )
}
