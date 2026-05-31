import { Search } from "lucide-react"
import { Input } from "#/components/ui/input"
import { AvatarMenu } from "#/components/pos/avatar-menu"
import { OfflineIndicator } from "#/components/pos/offline-indicator"

type Props = {
  query: string
  onQueryChange: (q: string) => void
  userName: string
  userEmail: string
  isOnline: boolean
  queued: number
  failed: number
  onOpenQueue: () => void
}

export function PosHeader({ query, onQueryChange, userName, userEmail, isOnline, queued, failed, onOpenQueue }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background px-3 py-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <Input
          aria-label="Search items"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search items..."
          className="h-11 pl-9 text-base"
        />
      </div>
      <OfflineIndicator
        isOnline={isOnline}
        queued={queued}
        failed={failed}
        onOpen={onOpenQueue}
      />
      <AvatarMenu userName={userName} userEmail={userEmail} />
    </header>
  )
}
