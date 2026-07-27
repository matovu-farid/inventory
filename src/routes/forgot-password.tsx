import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    // Always show generic success — never disclose whether the email exists.
    // Swallow thrown errors (network, 5xx) so the success message still
    // renders; Better Auth already returns 200 for non-existent emails.
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      })
    } catch {
      // Intentionally ignored.
    }
    setSubmitted(true)
    setPending(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
            Reset your password
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            We'll email you a link to choose a new one
          </p>
        </div>

        <div
          className="rounded-2xl bg-white p-6"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {submitted ? (
            <div className="text-center">
              <p className="text-[14px] text-foreground">
                If an account exists for that email, we've sent reset
                instructions.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                void handleSubmit(e)
              }}
              className="space-y-4"
            >
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
              <Button
                type="submit"
                className="h-10 w-full rounded-xl text-[13px] font-semibold"
                disabled={pending}
              >
                {pending ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          )}
        </div>

        {!submitted && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Remembered it?{' '}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
