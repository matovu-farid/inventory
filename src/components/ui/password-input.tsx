import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "#/lib/utils"
import { Input } from "#/components/ui/input"

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">

function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

export { PasswordInput }
