import type { FormEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

import { requestAccess } from '#/server/functions/request-access'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

type RequestAccessDialogProps = {
  trigger?: ReactElement
}

export function RequestAccessDialog({
  trigger = (
    <Button
      type="button"
      className="rounded-full bg-[#1c1917] px-5 text-white hover:bg-[#292524]"
    >
      Request access
    </Button>
  ),
}: RequestAccessDialogProps) {
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionId = useRef(0)

  useEffect(() => {
    return () => {
      submissionId.current += 1
    }
  }, [])

  function handleOpenChange(nextOpen: boolean) {
    submissionId.current += 1
    setOpen(nextOpen)

    if (nextOpen) {
      setFormKey((currentKey) => currentKey + 1)
      setIsSubmitting(false)
      setIsSubmitted(false)
      setError(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting || isSubmitted) {
      return
    }

    setError(null)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    if (!name || !message) {
      setError('Please enter a name and message.')
      return
    }

    setIsSubmitting(true)
    const currentSubmissionId = submissionId.current

    try {
      await requestAccess({
        data: {
          name,
          email,
          message,
        },
      })

      if (submissionId.current !== currentSubmissionId) {
        return
      }

      setIsSubmitted(true)
    } catch {
      if (submissionId.current !== currentSubmissionId) {
        return
      }

      setError('We were unable to deliver your request. Please try again.')
    } finally {
      if (submissionId.current === currentSubmissionId) {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl border-[#e7e1d9] bg-[#fffdf9] p-7">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-2xl tracking-[-0.03em] text-[#1c1917]">
            Bring your stock into focus.
          </DialogTitle>
          <DialogDescription className="leading-relaxed text-[#78716c]">
            Tell us a little about your team. An administrator must provide an
            invite before an account can be created.
          </DialogDescription>
        </DialogHeader>

        <form
          key={formKey}
          aria-label="Request access"
          className="space-y-4"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="request-access-name" className="text-[#44403c]">
              Name
            </Label>
            <Input
              id="request-access-name"
              name="name"
              placeholder="Your name"
              autoComplete="name"
              required
              className="h-11 rounded-xl border-[#e7e1d9] bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-access-email" className="text-[#44403c]">
              Email
            </Label>
            <Input
              id="request-access-email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              className="h-11 rounded-xl border-[#e7e1d9] bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-access-message" className="text-[#44403c]">
              Message
            </Label>
            <textarea
              id="request-access-message"
              name="message"
              placeholder="What are you hoping to keep in better view?"
              required
              className="min-h-24 w-full resize-y rounded-xl border border-[#e7e1d9] bg-white px-3 py-2 text-sm outline-none placeholder:text-[#a8a29e] focus-visible:border-[#0066E6] focus-visible:ring-3 focus-visible:ring-[#0066E6]/15"
            />
          </div>

          {isSubmitted && (
            <p role="status" className="text-sm text-[#166534]">
              Request sent. We&apos;ll be in touch soon.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[#b91c1c]">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2 sm:flex-row sm:justify-between">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-xl">
                Maybe later
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isSubmitting || isSubmitted}
              className="rounded-xl bg-[#0066E6] text-white hover:bg-[#0066E6]"
            >
              Request access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
