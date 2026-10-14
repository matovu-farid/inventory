import { cn } from '#/lib/utils'

function Logo({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center text-logo-symbol',
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 64 64"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M8 0H64V16H40V28H24V16H0V8Z M24 36H40V48H64V56L56 64H0V48H24Z" />
      </svg>
    </div>
  )
}

function LogoWordmark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('font-logo font-bold text-logo-wordmark', className)}
      {...props}
    >
      Inventory
    </span>
  )
}

export { Logo, LogoWordmark }
