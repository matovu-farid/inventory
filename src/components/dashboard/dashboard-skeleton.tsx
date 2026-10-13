import { Skeleton } from '#/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '#/components/ui/card'

export function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading dashboard"
    >
      <span className="sr-only">Loading dashboard…</span>
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
