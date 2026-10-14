import {
  ArrowLeftRight,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  PackageCheck,
} from 'lucide-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Logo, LogoWordmark } from '#/components/logo'
import { RequestAccessDialog } from '#/components/request-access-dialog'
import { WorkspacePreview } from '#/components/dashboard/workspace-preview'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Separator } from '#/components/ui/separator'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/home')({
  component: PublicHome,
})

const benefits = [
  {
    icon: PackageCheck,
    title: 'Know what’s in stock.',
    description:
      'Keep every item, variant, and location in one dependable view.',
    label: 'Stock clarity',
  },
  {
    icon: ArrowLeftRight,
    title: 'Move goods with confidence.',
    description:
      'Follow supply routes and transfers from first receipt to final sale.',
    label: 'Movement',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'See the numbers clearly.',
    description:
      'Turn daily activity into the reports your team can actually use.',
    label: 'Better decisions',
  },
]

function PublicHome() {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:flex-nowrap sm:px-6 lg:px-10">
          <Link
            to="/home"
            aria-label="Inventory home"
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
          >
            <Logo className="size-6 sm:size-8" />
            <LogoWordmark className="text-lg sm:text-2xl" />
          </Link>
          <nav
            aria-label="Primary navigation"
            className="ml-auto flex items-center gap-2 sm:gap-3"
          >
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <a href="#how-it-works">How it works</a>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/login">Sign in</Link>
            </Button>
            <RequestAccessDialog
              trigger={<Button variant="outline">Request access</Button>}
            />
          </nav>
        </div>
      </header>
      <main id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-10 lg:py-24">
          <div className="flex max-w-xl flex-col items-start gap-7">
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Run the floor with <span className="text-primary">clarity.</span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Inventory brings stock, sales, and supply routes into one calm,
              dependable view—so your team can spend less time reconciling and
              more time moving the business forward.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/login">
                  Start managing
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <RequestAccessDialog
                trigger={
                  <Button size="lg" variant="outline">
                    Request access
                  </Button>
                }
              />
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 shrink-0 text-primary" />
              Built for the details that keep a shop moving.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Core modules">
              <Badge variant="outline">Procurement</Badge>
              <Badge variant="outline">Warehouse</Badge>
              <Badge variant="outline">Retail</Badge>
              <Badge variant="outline">Reports</Badge>
            </div>
          </div>
          <WorkspacePreview />
        </section>
        <section id="how-it-works" className="border-y bg-card">
          <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
            <div className="flex max-w-xl flex-col gap-4">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                The details stay connected.
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                One place for the decisions your team makes every day, from what
                to order next to what actually sold.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {benefits.map((benefit) => (
                <article
                  key={benefit.label}
                  className="flex flex-col items-start gap-4"
                >
                  <benefit.icon className="size-6 text-primary" />
                  <h3 className="text-xl font-semibold tracking-tight">
                    {benefit.title}
                  </h3>
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                  <Badge variant="secondary">{benefit.label}</Badge>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
          <Card>
            <CardHeader className="gap-4 max-sm:flex max-sm:flex-col">
              <CardTitle>Bring the work into one view.</CardTitle>
              <CardDescription>
                Stock, sales, and supply routes. Connected from first receipt to
                final sale.
              </CardDescription>
              <CardAction className="max-sm:self-start">
                <Button asChild>
                  <Link to="/login">
                    Open your workspace
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        </section>
      </main>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <Separator />
      </div>
      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span>Clearer operations for growing businesses.</span>
        </div>
        <p>
          Already have access?{' '}
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/login">Sign in</Link>
          </Button>
        </p>
      </footer>
    </div>
  )
}
