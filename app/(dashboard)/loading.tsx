import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <main className="pulsar-container" aria-label="Загрузка страницы">
      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <Skeleton className="aspect-[21/9] w-full rounded-none" />
        <CardContent className="flex min-h-56 flex-col justify-center gap-4 p-4">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-[18px]" />
        </CardContent>
      </Card>
    </main>
  )
}
