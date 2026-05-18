import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"
import { cn } from "#/lib/utils"

type RootProps = React.ComponentProps<typeof Dialog>

export function ResponsiveDialog(props: RootProps) {
  const isMobile = useIsMobile()
  return isMobile ? <Sheet {...props} /> : <Dialog {...props} />
}

type ContentProps = React.ComponentProps<typeof DialogContent> & {
  side?: "bottom" | "right" | "left" | "top"
}

export function ResponsiveDialogContent({ className, side = "bottom", children, ...props }: ContentProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <SheetContent
        side={side}
        className={cn("max-h-[92dvh] overflow-y-auto", className)}
        {...(props)}
      >
        {children}
      </SheetContent>
    )
  }
  return (
    <DialogContent
      className={cn("max-h-[90dvh] overflow-y-auto", className)}
      {...props}
    >
      {children}
    </DialogContent>
  )
}

export function ResponsiveDialogHeader(props: React.ComponentProps<typeof DialogHeader>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetHeader {...(props)} /> : <DialogHeader {...props} />
}

export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetTitle {...(props)} /> : <DialogTitle {...props} />
}

export function ResponsiveDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile()
  return isMobile
    ? <SheetDescription {...(props)} />
    : <DialogDescription {...props} />
}

export function ResponsiveDialogFooter(props: React.ComponentProps<typeof DialogFooter>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetFooter {...(props)} /> : <DialogFooter {...props} />
}
