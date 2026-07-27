import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import { PasswordInput } from '#/components/ui/password-input'
import { Label } from '#/components/ui/label'
import { acceptInvite, peekInviteServer } from '#/server/functions/admin/users'

export const Route = createFileRoute('/accept-invite')({
  validateSearch: z.object({ token: z.string().min(1) }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    const result = await peekInviteServer({ data: { token: deps.token } })
    return { peek: result }
  },
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const { peek } = Route.useLoaderData()
  const { token } = Route.useSearch()
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (!peek.valid) {
    return (
      <Centered>
        <h1 className="text-[20px] font-semibold">Invite no longer valid</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          This invite link has expired or has already been used. Ask your
          administrator for a new one.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
        >
          Go to sign in
        </Link>
      </Centered>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setPending(true)
    try {
      await acceptInvite({ data: { token, password } })
      await router.navigate({ to: '/' })
    } catch (err) {
      setError((err as Error).message || 'Could not accept invite.')
      setPending(false)
    }
  }

  return (
    <Centered>
      <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
        Welcome to Inventory Management
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Set a password for <strong>{peek.email}</strong> to finish setting up
        your account.
      </p>
      <div
        className="mt-6 rounded-2xl bg-white p-6 text-left"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <form
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
          className="space-y-4"
        >
          {error && (
            <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">
              Password
            </Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-[13px]">
              Confirm password
            </Label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              className="h-10 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            className="h-10 w-full rounded-xl text-[13px] font-semibold"
            disabled={pending}
          >
            {pending ? 'Setting up...' : 'Set password & sign in'}
          </Button>
        </form>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[420px] px-6 text-center">
        <Logo className="mx-auto size-12 shadow-md" />
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
