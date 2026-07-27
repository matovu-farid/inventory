import { Link, useRouter } from '@tanstack/react-router'
import { Receipt, PackageCheck, LogOut, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { authClient } from '#/lib/auth-client'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AvatarMenu({
  userName,
  userEmail,
}: {
  userName: string
  userEmail: string
}) {
  const router = useRouter()
  async function handleLogout() {
    await authClient.signOut()
    await router.navigate({ to: '/login' })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {userEmail}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={'/shop/sales'}>
            <Receipt className="mr-2 size-4" /> Sales history
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={'/shop'}>
            <PackageCheck className="mr-2 size-4" /> Receive transfers
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={'/settings'}>
            <User className="mr-2 size-4" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleLogout()}>
          <LogOut className="mr-2 size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
