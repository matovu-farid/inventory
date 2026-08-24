import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PasswordInput } from '#/components/ui/password-input'
import { Label } from '#/components/ui/label'
import { authClient } from '#/lib/auth-client'
import {
  hasSuccessfulAuth,
  markRememberedLogin,
} from '#/lib/auth/remembered-login'
import { usersExist } from '#/server/functions/auth/users-exist'

const searchSchema = z.object({
  error: z.enum(['verification_failed']).optional(),
  reset: z.enum(['success']).optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  loader: async () => {
    const exists = await usersExist()
    return { usersExist: exists }
  },
  component: LoginPage,
})

function LoginPage() {
  const { usersExist: exists } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  // Bootstrap only allows the first user (signup). After that, login only.
  const showSignup = !exists
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)

    try {
      if (showSignup) {
        const result = await authClient.signUp.email({ name, email, password })
        if (!hasSuccessfulAuth(result)) {
          setError(result.error?.message ?? 'Sign-up failed')
          setPending(false)
          return
        }
        markRememberedLogin()
        await navigate({
          to: '/verify-email-sent',
          search: { email },
        })
        return
      }

      const result = await authClient.signIn.email({ email, password })
      if (!hasSuccessfulAuth(result)) {
        const code = (result.error as { code?: string } | null)?.code
        if (
          code === 'EMAIL_NOT_VERIFIED' ||
          /verif/i.test(result.error?.message ?? '')
        ) {
          await navigate({
            to: '/verify-email-sent',
            search: { email },
          })
          return
        }
        setError(result.error?.message ?? 'Invalid email or password')
        setPending(false)
        return
      }
      markRememberedLogin()
      await navigate({ to: '/' })
    } catch {
      setError(showSignup ? 'Sign-up failed.' : 'Login failed.')
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {showSignup ? 'Create the first admin account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {showSignup
              ? 'Set up the first user for Inventory Management'
              : 'Sign in to Inventory Management'}
          </p>
        </div>

        <div
          className="rounded-2xl bg-white p-6"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="space-y-4"
          >
            {search.reset === 'success' && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
                Password updated. Sign in with your new password.
              </div>
            )}
            {search.error === 'verification_failed' && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                Verification link is invalid or expired. Sign in to request a
                new one.
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
                {error}
              </div>
            )}

            {showSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px]">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[13px]">
                  Password
                </Label>
                {!showSignup && (
                  <Link
                    to="/forgot-password"
                    className="text-[12px] font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <Button
              type="submit"
              className="h-10 w-full rounded-xl text-[13px] font-semibold"
              disabled={pending}
            >
              {pending
                ? showSignup
                  ? 'Creating account...'
                  : 'Signing in...'
                : showSignup
                  ? 'Create Account'
                  : 'Sign In'}
            </Button>
          </form>
        </div>

        {!showSignup && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Need access? Ask your administrator for an invite.
          </p>
        )}
      </div>
    </div>
  )
}
