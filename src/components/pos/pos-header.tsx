import { Search } from "lucide-react"
import { Input } from "#/components/ui/input"
import { AvatarMenu } from "#/components/pos/avatar-menu"

type Props = {
  query: string
  onQueryChange: (q: string) => void
  userName: string
  userEmail: string
}

export function PosHeader({ query, onQueryChange, userName, userEmail }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background px-3 py-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <Input
          aria-label="Search products"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search products..."
          className="h-11 pl-9 text-base"
        />
      </div>
      <AvatarMenu userName={userName} userEmail={userEmail} />
    </header>
  )
}
