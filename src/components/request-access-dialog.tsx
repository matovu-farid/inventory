import type { ReactElement } from 'react'
import { useState } from 'react'

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          aria-label="Request access"
          className="space-y-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <Label htmlFor="request-access-name" className="text-[#44403c]">
              Name
            </Label>
            <Input
              id="request-access-name"
              name="name"
              placeholder="Your name"
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
              className="min-h-24 w-full resize-y rounded-xl border border-[#e7e1d9] bg-white px-3 py-2 text-sm outline-none placeholder:text-[#a8a29e] focus-visible:border-[#0066E6] focus-visible:ring-3 focus-visible:ring-[#0066E6]/15"
            />
          </div>

          <DialogFooter className="pt-2 sm:flex-row sm:justify-between">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-xl">
                Maybe later
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled
              className="rounded-xl bg-[#0066E6] text-white hover:bg-[#0066E6]"
            >
              Request access (coming soon)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
