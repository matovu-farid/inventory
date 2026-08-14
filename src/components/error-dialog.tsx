import { CircleAlert } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ErrorDetails } from '#/components/error-details'
import { Button } from '#/components/ui/button'
import { getSafeErrorMessage } from '#/lib/error-handling'

interface ErrorDialogProps {
  open: boolean
  error: unknown
  onOpenChange: (open: boolean) => void
  onRetry?: () => void
  title?: string
  message?: string
}

export function ErrorDialog({
  open,
  error,
  onOpenChange,
  onRetry,
  title = 'Something went wrong',
  message,
}: ErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <CircleAlert className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {getSafeErrorMessage(error, message)}
          </DialogDescription>
          <ErrorDetails error={error} />
        </DialogHeader>
        <DialogFooter>
          {onRetry ? (
            <Button
              type="button"
              onClick={() => {
                onRetry()
                onOpenChange(false)
              }}
            >
              Try again
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
