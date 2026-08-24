import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowDown,
  ChartNoAxesCombined,
  Check,
  PackageCheck,
} from 'lucide-react'
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router'

import { Logo } from '#/components/logo'
import { RequestAccessDialog } from '#/components/request-access-dialog'
import { Button } from '#/components/ui/button'
import {
  getHomeRedirect,
  hasRememberedLogin,
} from '#/lib/auth/remembered-login'

export const Route = createFileRoute('/home')({
  beforeLoad: ({ context }) => {
    const redirectTo = getHomeRedirect({
      hasSession: Boolean(context.session),
      hasRememberedLogin: false,
    })
    if (redirectTo) throw redirect({ to: redirectTo })
  },
  component: PublicHome,
})

const benefits = [
  {
    icon: PackageCheck,
    eyebrow: '01 / Stock clarity',
    title: 'Know what’s in stock.',
    description:
      'Keep every item, variant, and location in one dependable view.',
    accent: 'bg-[#eaf3ff] text-[#0066E6]',
  },
  {
    icon: ArrowLeftRight,
    eyebrow: '02 / Movement',
    title: 'Move goods with confidence.',
    description:
      'Follow supply routes and transfers from first receipt to final sale.',
    accent: 'bg-[#eaf6ef] text-[#15803d]',
  },
  {
    icon: ChartNoAxesCombined,
    eyebrow: '03 / Better decisions',
    title: 'See the numbers clearly.',
    description:
      'Turn daily activity into the reports your team can actually use.',
    accent: 'bg-[#eef1fb] text-[#4f46a5]',
  },
]

function PublicHome() {
  const navigate = useNavigate()
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)

  useEffect(() => {
    const redirectTo = getHomeRedirect({
      hasSession: false,
      hasRememberedLogin: hasRememberedLogin(),
    })
    if (redirectTo) {
      void navigate({ to: redirectTo, replace: true })
      return
    }

    setIsCheckingAccess(false)
  }, [navigate])

  if (isCheckingAccess) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#f7f4ef] text-sm text-[#78716c]"
        aria-busy="true"
      >
        Loading your workspace…
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f4ef] text-[#1c1917]">
      <header className="relative z-10 border-b border-[#e7e1d9]/80 bg-[#f7f4ef]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link
            to="/home"
            aria-label="Inventory home"
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0066E6]/50"
          >
            <Logo className="size-9" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">
              Inventory
            </span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-2 sm:gap-5"
          >
            <a
              href="#how-it-works"
              className="hidden rounded-md px-2 py-1.5 text-sm text-[#78716c] outline-none transition-colors hover:text-[#1c1917] focus-visible:ring-2 focus-visible:ring-[#0066E6]/50 sm:block"
            >
              How it works
            </a>
            <Link
              to="/login"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-[#57534e] outline-none transition-colors hover:text-[#1c1917] focus-visible:ring-2 focus-visible:ring-[#0066E6]/50"
            >
              Sign in
            </Link>
            <RequestAccessDialog
              trigger={
                <Button
                  type="button"
                  className="h-9 rounded-full bg-[#1c1917] px-4 text-xs text-white hover:bg-[#292524]"
                >
                  Request access
                </Button>
              }
            />
          </nav>
        </div>
        <a
          href="#how-it-works"
          className="flex items-center justify-center gap-1 border-t border-[#e7e1d9]/70 px-6 py-3 text-xs font-medium text-[#57534e] outline-none transition-colors hover:text-[#0066E6] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0066E6]/50 sm:hidden"
        >
          How it works
          <ArrowDown className="size-3.5" />
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 lg:px-10 lg:pb-28 lg:pt-24">
          <div className="max-w-xl">
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0066E6]">
              Inventory control for growing teams
            </p>
            <h1 className="max-w-lg text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#1c1917] sm:text-6xl lg:text-[70px]">
              Run the floor with{' '}
              <span className="text-[#0066E6]">clarity.</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-[#78716c] sm:text-lg">
              Inventory brings stock, sales, and supply routes into one calm,
              dependable view—so your team can spend less time reconciling and
              more time moving the business forward.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-11 rounded-full bg-[#1c1917] px-6 text-sm text-white shadow-[0_10px_24px_rgba(28,25,23,0.14)] hover:bg-[#292524]"
              >
                <Link to="/login">
                  Start managing
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <RequestAccessDialog
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-full px-5 text-sm text-[#57534e] hover:bg-[#ede8e1] hover:text-[#1c1917]"
                  >
                    Request access
                  </Button>
                }
              />
            </div>
            <div className="mt-10 flex items-center gap-2 text-xs text-[#78716c]">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#dff3e5] text-[#15803d]">
                <Check className="size-3" strokeWidth={2.5} />
              </span>
              Built for the details that keep a shop moving.
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl lg:mr-0">
            <div className="absolute -left-10 top-8 size-32 rounded-full bg-[#cfe3ff]/70 blur-3xl" />
            <div className="absolute -right-10 bottom-2 size-40 rounded-full bg-[#d9e9df]/80 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-[#e3dcd4] bg-[#fffdf9] p-3 shadow-[0_30px_70px_rgba(68,54,42,0.12)] sm:p-5">
              <div className="flex items-center justify-between border-b border-[#eee8e1] px-2 pb-4 sm:px-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">
                    Overview
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#292524]">
                    Monday, 24 August
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#f4f0eb] px-3 py-2 text-[10px] font-medium text-[#78716c]">
                  <span className="size-1.5 rounded-full bg-[#22c55e]" />
                  All systems clear
                </div>
              </div>

              <div className="grid gap-3 py-4 sm:grid-cols-3">
                {[
                  ['1,284', 'Items in stock', 'up 8.2%', 'text-[#0066E6]'],
                  [
                    'UGX 4.8m',
                    'Sales this month',
                    'up 12.4%',
                    'text-[#15803d]',
                  ],
                  ['07', 'Open movements', '2 due today', 'text-[#4f46a5]'],
                ].map(([value, label, trend, trendColor]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-[#eee8e1] bg-[#fffcf8] p-3.5"
                  >
                    <p className="text-xl font-semibold tracking-[-0.04em] text-[#292524]">
                      {value}
                    </p>
                    <p className="mt-1 text-[10px] text-[#a8a29e]">{label}</p>
                    <p
                      className={`mt-3 text-[10px] font-semibold ${trendColor}`}
                    >
                      {trend}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border border-[#eee8e1] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#292524]">
                        Stock movement
                      </p>
                      <p className="mt-1 text-[10px] text-[#a8a29e]">
                        Last 7 days
                      </p>
                    </div>
                    <ChartNoAxesCombined className="size-4 text-[#0066E6]" />
                  </div>
                  <div className="mt-5 flex h-24 items-end gap-2 px-1">
                    {[34, 48, 42, 68, 55, 76, 88].map((height, index) => (
                      <div
                        key={index}
                        className="flex-1 rounded-t-md bg-[#dcecff] last:bg-[#0066E6]"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between px-1 text-[9px] text-[#a8a29e]">
                    <span>Mon</span>
                    <span>Thu</span>
                    <span>Sun</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#eee8e1] bg-[#fffaf5] p-4">
                  <p className="text-xs font-semibold text-[#292524]">
                    Recent activity
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      ['Received', '12 items', 'bg-[#dff3e5]'],
                      ['Transferred', 'Shop 02 → 01', 'bg-[#eaf3ff]'],
                      ['Sale recorded', 'UGX 180,000', 'bg-[#eef1fb]'],
                    ].map(([title, detail, dot]) => (
                      <div key={title} className="flex items-start gap-2.5">
                        <span className={`mt-0.5 size-2 rounded-full ${dot}`} />
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-semibold text-[#57534e]">
                            {title}
                          </p>
                          <p className="mt-0.5 truncate text-[9px] text-[#a8a29e]">
                            {detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="px-2 pb-1 pt-4 text-center text-[10px] text-[#a8a29e]">
                A clearer view of the work behind every sale.
              </p>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-[#e7e1d9] bg-[#fbf9f6]"
        >
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0066E6]">
                Less guesswork, more momentum
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#1c1917] sm:text-4xl">
                The details stay connected.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#78716c]">
                One place for the decisions your team makes every day, from what
                to order next to what actually sold.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {benefits.map((benefit) => (
                <article
                  key={benefit.eyebrow}
                  className="rounded-3xl border border-[#e7e1d9] bg-[#fffdf9] p-6 transition-transform duration-200 hover:-translate-y-1"
                >
                  <div
                    className={`flex size-11 items-center justify-center rounded-2xl ${benefit.accent}`}
                  >
                    <benefit.icon className="size-5" strokeWidth={1.8} />
                  </div>
                  <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">
                    {benefit.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#292524]">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#78716c]">
                    {benefit.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-[#78716c] sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span>Clearer operations for growing businesses.</span>
        </div>
        <p>
          Already have access?{' '}
          <Link
            to="/login"
            className="font-medium text-[#0066E6] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  )
}
