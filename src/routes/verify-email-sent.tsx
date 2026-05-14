import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { authClient } from "#/lib/auth-client"

export const Route = createFileRoute("/verify-email-sent")({
  validateSearch: z.object({ email: z.email() }),
  component: VerifyEmailSentPage,
})

function VerifyEmailSentPage() {
  const { email } = Route.useSearch()
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  )

  async function handleResend() {
    setStatus("sending")
    const result = await authClient.sendVerificationEmail({ email })
    if (result.error) {
      setStatus("error")
      return
    }
    setStatus("sent")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[440px] px-6 text-center">
        <Logo className="mx-auto size-12 shadow-md" />
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
          Check your inbox
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          We sent a verification link to <strong>{email}</strong>. Click the
          link in that email to finish signing in.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 text-left" style={{ boxShadow: "var(--shadow-lg)" }}>
          <p className="text-[13px] text-muted-foreground mb-3">
            Didn't get it? Check your spam folder, or resend the email below.
          </p>
          <Button
            type="button"
            onClick={() => { void handleResend() }}
            disabled={status === "sending" || status === "sent"}
            className="h-10 w-full rounded-xl text-[13px] font-semibold"
          >
            {status === "sending"
              ? "Sending..."
              : status === "sent"
                ? "Sent — check your inbox"
                : "Resend verification email"}
          </Button>
          {status === "error" && (
            <p className="mt-3 text-[12px] text-destructive">
              Could not resend right now. Try again in a moment.
            </p>
          )}
        </div>

        <p className="mt-6 text-[13px]">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
