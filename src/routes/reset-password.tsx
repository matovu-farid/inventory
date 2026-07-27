import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import { PasswordInput } from '#/components/ui/password-input'
import { Label } from '#/components/ui/label'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.enum(['INVALID_TOKEN']).optional(),
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error: searchError } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const tokenInvalid = !token || searchError === 'INVALID_TOKEN'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!token) {
      setError('Reset link is missing its token. Request a new email.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setPending(true)
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    })
    if (result.error) {
      setError(result.error.message ?? 'Could not reset password.')
      setPending(false)
      return
    }
    await router.navigate({ to: '/login', search: { reset: 'success' } })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
            Choose a new password
          </h1>
        </div>

        <div
          className="rounded-2xl bg-white p-6"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {tokenInvalid ? (
            <div className="text-center">
              <p className="text-[14px] text-destructive">
                This reset link is invalid or has expired.
              </p>
              <Link
                to="/forgot-password"
                className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
              >
                Request a new link
              </Link>
            </div>
          ) : (
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
                  New password
                </Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 rounded-xl"
                  required
                  minLength={8}
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
                  className="h-10 rounded-xl"
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full rounded-xl text-[13px] font-semibold"
                disabled={pending}
              >
                {pending ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
