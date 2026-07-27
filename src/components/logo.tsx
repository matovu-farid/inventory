import { cn } from '#/lib/utils'

function Logo({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[22%] bg-gradient-to-br from-[#4DA6FF] to-[#0066E6] shadow-sm',
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-[62%]"
      >
        {/* Box body */}
        <rect x="136" y="240" width="240" height="164" rx="24" fill="#fff" />
        {/* Lid */}
        <rect x="118" y="188" width="276" height="64" rx="18" fill="#fff" />
        {/* Tape */}
        <rect
          x="244"
          y="188"
          width="24"
          height="216"
          rx="4"
          fill="#0066E6"
          opacity="0.18"
        />
        {/* Arrow shaft */}
        <path
          d="M256 342 V272"
          stroke="#0066E6"
          strokeWidth="22"
          strokeLinecap="round"
        />
        {/* Arrow head */}
        <path
          d="M228 298 L256 268 L284 298"
          fill="none"
          stroke="#0066E6"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export { Logo }
